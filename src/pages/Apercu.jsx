import { useMemo, useState, useEffect } from 'react'
import {
  AlertTriangle, RefreshCw, Sparkles, Check, CircleDashed, ArrowUpRight,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import { useAuth } from '../contexts/Auth'
import { useSociete } from '../contexts/Societe'
import { supabase } from '../lib/supabase'
import { fmt, fmtPct, MONTHS_SHORT, getLoyerActuel } from '../lib/utils'
import { agregatsBiens, partSociete, estAcquis, tresorerieReelle, coefTva, attenduMois } from '../lib/calculs'

const NAVY = '#16294a'
const BRAND = '#3f6ad8'
const POSITIVE = '#2e7d4f'
const NEGATIVE = '#d64545'
const AMBER = '#c99a3c'
const FAINT = '#8a94a3'
const BORDER = '#e8ebf0'

// ── Small primitives ──────────────────────────────────────────
function Card({ children, className = '', style, ...rest }) {
  return (
    <div
      className={`bg-white rounded-2xl border ${className}`}
      style={{ borderColor: BORDER, ...style }}
      {...rest}
    >
      {children}
    </div>
  )
}

function KpiCard({ label, value, hint, hintColor, tone, onClick }) {
  const bg = tone === 'negative' ? '#fff7f6' : '#ffffff'
  const border = tone === 'negative' ? '#f4d9d5' : BORDER
  const labelColor = tone === 'negative' ? '#b25b50' : FAINT
  const valueColor = tone === 'negative' ? NEGATIVE : tone === 'positive' ? POSITIVE : NAVY
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl px-5 py-5 border ${onClick ? 'cursor-pointer transition-all hover:-translate-y-[1px]' : ''}`}
      style={{
        background: bg,
        borderColor: border,
        boxShadow: onClick ? '0 0 0 rgba(0,0,0,0)' : undefined,
      }}
    >
      <p className="m-0 mb-1.5 text-[13px]" style={{ color: labelColor }}>{label}</p>
      <p className="m-0 num text-[28px] font-bold" style={{ color: valueColor }}>{value}</p>
      {hint && (
        <p className="m-0 mt-1.5 text-[12px] font-medium" style={{ color: hintColor || FAINT }}>
          {hint}
        </p>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────
export default function Apercu({ navigate }) {
  const { user } = useAuth()
  const { biens, locataires, baux, transactions, bienActionnaires, bankConnection, bankAccounts, bankTransactions, courriers } = useSociete()

  const bauxActifs = baux.filter(b => b.actif)

  // ── KPIs ────────────────────────────────────────────────────
  // Pondérés par la quote-part réellement détenue par la société : un bien
  // détenu à 50 % ne pèse que pour moitié dans le patrimoine et le cashflow.
  const agg = agregatsBiens(biens, bienActionnaires, baux)
  const valeurPatrimoine = agg.valeurNette
  const cashflowMensualise = agg.cashflowNet
  // Un bail rattaché à un bien non encore acquis ne produit aucun loyer.
  const loyersMensuels = bauxActifs.reduce((s, b) => {
    const bien = biens.find(x => x.id === b.bien_id)
    if (bien && !estAcquis(bien)) return s
    const part = partSociete(b.bien_id, bienActionnaires)
    // getLoyerActuel est borné par les dates du bail : un bail terminé ou
    // pas encore commencé compte 0, sans fallback.
    return s + getLoyerActuel(b) * part
  }, 0)
  // Impayés en TTC, comme partout ailleurs dans le suivi.
  const impayes = transactions.filter(t => t.statut === 'impayé')
  const totalImpayes = impayes.reduce((s, t) => {
    const coef = coefTva(baux.find(b => b.id === t.bail_id))
    return s + ((t.montant_loyer || 0) + (t.montant_charges || 0)) * coef
  }, 0)

  // ── À traiter ──────────────────────────────────────────────
  const now = new Date()

  const impayesAlerts = impayes.slice(0, 3).map(t => {
    const bail = baux.find(b => b.id === t.bail_id)
    const loc = bail ? locataires.find(l => l.id === bail.locataire_id) : null
    const echeance = new Date(t.annee, t.mois, 1)
    const dLate = Math.max(0, Math.round((now - echeance) / 86400000))
    return {
      kind: 'impaye',
      title: `Loyer impayé — ${loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || 'Locataire'}`,
      detail: `${MONTHS_SHORT[t.mois]} ${t.annee} · ${fmt((t.montant_loyer || 0) + (t.montant_charges || 0))} · J+${dLate}`,
      action: 'Voir le dossier',
      onAction: () => navigate('flux', { tab: 'relances' }),
    }
  })

  const revisionAlerts = bauxActifs
    .filter(b => b.date_revision_anniversaire)
    .map(b => {
      const rev = new Date(b.date_revision_anniversaire)
      const rty = new Date(now.getFullYear(), rev.getMonth(), rev.getDate())
      if (rty < now) rty.setFullYear(now.getFullYear() + 1)
      const diff = Math.round((rty - now) / 86400000)
      return { b, diff }
    })
    .filter(x => x.diff <= 45)
    .slice(0, 2)
    .map(({ b, diff }) => {
      const loc = locataires.find(l => l.id === b.locataire_id)
      return {
        kind: 'revision',
        title: `Révision de loyer — ${loc?.raison_sociale || loc?.nom || 'Locataire'}`,
        detail: `Échéance dans ${diff} jour${diff > 1 ? 's' : ''} · indice ${b.indice_revision || 'ILC'}`,
        action: 'Appliquer',
        onAction: () => navigate('patrimoine', { tab: 'revisions' }),
      }
    })

  const aTraiter = [...impayesAlerts, ...revisionAlerts]

  // ── Trésorerie 2026 ────────────────────────────────────────
  // Banque connectée : solde réel en fin de chaque mois, reconstruit à
  // rebours depuis le solde actuel avec les mouvements réels — exact sur
  // toute la fenêtre bancaire, interrompu avant elle plutôt qu'inventé.
  // Sans banque : l'ancienne projection déclarative, clairement étiquetée.
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const reel = useMemo(
    () => tresorerieReelle({ bankAccounts, bankTransactions }),
    [bankAccounts, bankTransactions],
  )
  const treso = useMemo(() => {
    if (reel) {
      // La trésorerie est un instantané : chaque point est le solde exact au
      // matin d'une date — les 1ers du mois couverts par l'historique
      // bancaire, puis aujourd'hui.
      const points = []
      for (let m = 0; m < 12; m++) {
        const iso = `${currentYear}-${String(m + 1).padStart(2, '0')}-01`
        if (reel.debut && iso >= reel.debut && new Date(currentYear, m, 1) <= now) {
          points.push({
            mois: `01/${String(m + 1).padStart(2, '0')}`,
            date: `01/${String(m + 1).padStart(2, '0')}/${currentYear}`,
            solde: Math.round(reel.soldeALaDate(iso)),
          })
        }
      }
      const dd = String(now.getDate()).padStart(2, '0')
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      points.push({ mois: `${dd}/${mm}`, date: `${dd}/${mm}/${currentYear}`, solde: Math.round(reel.soldeActuel) })
      return points
    }
    const monthly = Array.from({ length: 12 }, (_, m) => {
      const entrees = transactions
        .filter(t => t.annee === currentYear && t.mois === m && t.statut === 'payé')
        .reduce((s, t) => s + (t.montant_loyer || 0) + (t.montant_charges || 0), 0)
      // Sorties estimées : annuités + charges non refacturables mensualisées,
      // ramenées à la quote-part détenue par la société.
      const sorties = biens.reduce((s, bien) => {
        const part = partSociete(bien.id, bienActionnaires)
        return s + ((bien.annuites || 0) + (bien.charges_non_refacturables || 0) / 12) * part
      }, 0)
      return { mois: MONTHS_SHORT[m], solde: 0, entrees, sorties, net: entrees - sorties }
    })
    let cum = 0
    monthly.forEach(row => { cum += row.net; row.solde = Math.round(cum) })
    return monthly
  }, [reel, transactions, biens, bienActionnaires, currentYear])

  // ── Traité cette nuit : l'activité réelle des dernières 24 h ──
  // Rapprochements automatiques du moteur bancaire et courriers partis
  // tout seuls — pas un compteur déclaratif déguisé.
  const depuisHier = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const rapprochesAuto = bankTransactions.filter(t =>
    t.statut_rapprochement === 'rapproche_auto' && t.rapproche_le && t.rapproche_le >= depuisHier).length
  const courriersAuto = (courriers || []).filter(c =>
    c.canal === 'email' && !c.envoye_par && c.statut === 'envoye' && c.envoye_le >= depuisHier).length

  // ── Encaissé {année} — tout en TTC, même périmètre des deux côtés ──
  // Attendu : l'échéancier des baux (bornés par leurs dates, TTC), limité aux
  // mois échus. Encaissé : les virements rapprochés (réel) si la banque est
  // connectée, les échéances déclarées payées (TTC) sinon.
  const attendu = bauxActifs.reduce((s, b) => {
    const coef = coefTva(b)
    let somme = 0
    for (let m = 0; m <= currentMonth; m++) somme += attenduMois(b, m, currentYear) * coef
    return s + somme
  }, 0)
  const encaisseReel = reel
    ? bankTransactions
        .filter(t => Number(t.amount) > 0 && t.transaction_id
          && t.statut_rapprochement?.startsWith('rapproche')
          && t.booking_date && new Date(t.booking_date).getFullYear() === currentYear)
        .reduce((s, t) => s + Number(t.amount), 0)
    : null
  const encaisse = encaisseReel ?? transactions
    .filter(t => t.annee === currentYear && t.statut === 'payé')
    .reduce((s, t) => {
      const coef = coefTva(baux.find(b => b.id === t.bail_id))
      return s + ((t.montant_loyer || 0) + (t.montant_charges || 0)) * coef
    }, 0)
  const pct = attendu > 0 ? Math.min(100, Math.round((encaisse / attendu) * 100)) : 0

  // ── Opportunité de la semaine : la meilleure trouvaille récente de la veille ──
  const [oppSemaine, setOppSemaine] = useState(null)
  useEffect(() => {
    let vivant = true
    supabase.from('opportunites')
      .select('id, recherche, adresse, ville, code_postal, prix, loyer_annuel, type_offre, rendement_brut, score, decouvert_le, lien')
      .eq('statut', 'active').eq('hors_critere', false)
      .not('score', 'is', null)
      .order('decouvert_le', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!vivant || !data?.length) return
        // La mieux notée parmi les découvertes des 7 derniers jours ; à
        // défaut, la mieux notée des 30 dernières entrées.
        const semaine = data.filter(o =>
          o.decouvert_le && (now - new Date(o.decouvert_le)) < 7 * 86400000)
        const pool = semaine.length ? semaine : data
        setOppSemaine([...pool].sort((a, b) => (b.score || 0) - (a.score || 0))[0])
      })
    return () => { vivant = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Nom + sync info ────────────────────────────────────────
  const firstName = (user?.user_metadata?.full_name || user?.email || '').split(/[\s@.]+/)[0] || ''
  const initials = (user?.user_metadata?.full_name || user?.email || 'User')
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('')

  const nbActions = aTraiter.length
  const today = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)

  // ── Pastille de synchronisation bancaire ───────────────────
  // Reflète l'état réel de bank_connections pour la société courante.
  const banque = (() => {
    const st = bankConnection?.status
    if (st === 'connected') {
      const nom = bankConnection.institution_name || 'Banque'
      let quand = 'jamais synchronisée'
      if (bankConnection.last_sync) {
        const diffMin = Math.round((now - new Date(bankConnection.last_sync)) / 60000)
        if (diffMin < 2) quand = "à l'instant"
        else if (diffMin < 60) quand = `il y a ${diffMin} min`
        else if (diffMin < 48 * 60) quand = `il y a ${Math.round(diffMin / 60)} h`
        else quand = `il y a ${Math.round(diffMin / 1440)} j`
      }
      return {
        bg: '#e3efe7', fg: POSITIVE,
        label: `${nom} · ${quand}`,
        title: 'Compte bancaire connecté — cliquez pour voir les mouvements',
        onClick: () => navigate('flux', { tab: 'banque' }),
      }
    }
    if (st === 'expired') {
      return {
        bg: '#fdf9ef', fg: AMBER,
        label: 'Consentement bancaire expiré',
        title: "L'autorisation DSP2 est arrivée à échéance — cliquez pour reconnecter (l'historique est conservé)",
        onClick: () => navigate('parametres', { tab: 'banque' }),
      }
    }
    return {
      bg: '#f2f4f7', fg: FAINT,
      label: 'Banque non connectée',
      title: 'Aucun compte bancaire connecté — cliquez pour en connecter un',
      onClick: () => navigate('parametres', { tab: 'banque' }),
    }
  })()

  return (
    <div style={{ padding: '32px 36px', minWidth: 0 }}>
      {/* Header */}
      <div className="flex justify-between items-start mb-7 flex-wrap gap-3">
        <div>
          <h1 className="m-0 text-[24px] font-bold" style={{ color: NAVY, letterSpacing: '-0.3px' }}>
            Bonjour {firstName || 'Anthony'}
          </h1>
          <p className="m-0 mt-1 text-[14px]" style={{ color: FAINT }}>
            {today.charAt(0).toUpperCase() + today.slice(1)}
            {nbActions > 0 && ` — ${nbActions} action${nbActions > 1 ? 's' : ''} attend${nbActions > 1 ? 'ent' : ''} votre attention`}
          </p>
        </div>
        <div className="flex gap-2.5 items-center">
          <button
            onClick={banque.onClick}
            className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full border-0 cursor-pointer transition-opacity hover:opacity-80"
            style={{ background: banque.bg, color: banque.fg }}
            title={banque.title}
          >
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: banque.fg }} />
            {banque.label}
          </button>
          <div
            className="w-9 h-9 rounded-full text-white text-[13px] font-bold flex items-center justify-center"
            style={{ background: NAVY }}
          >
            {initials}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        <KpiCard
          label="Valeur d'acquisition (quote-part)"
          value={valeurPatrimoine ? fmt(valeurPatrimoine) : '—'}
          hint={
            agg.nbEnCours > 0
              ? `+ ${agg.nbEnCours} en cours d'acquisition (${fmt(agg.valeurEnCours)})`
              : biens.length ? `${biens.length} bien${biens.length > 1 ? 's' : ''}` : null
          }
          hintColor={agg.nbEnCours > 0 ? AMBER : undefined}
        />
        <KpiCard
          label="Loyers mensuels (HT)"
          value={fmt(loyersMensuels)}
          hint={bauxActifs.length ? `${bauxActifs.length} bail${bauxActifs.length > 1 ? ' actifs' : ' actif'} · baux en cours seulement` : 'Aucun bail actif'}
        />
        <KpiCard
          label="Cashflow mensuel estimé"
          value={(cashflowMensualise >= 0 ? '+' : '') + fmt(cashflowMensualise)}
          hint="estimation fiches biens — le réel est dans Analyse"
          tone={cashflowMensualise >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          label="Impayés"
          value={totalImpayes > 0 ? fmt(totalImpayes) : '0 €'}
          hint={impayes.length ? `${impayes.length} échéance${impayes.length > 1 ? 's' : ''} en retard (TTC)` : 'À jour'}
          tone={totalImpayes > 0 ? 'negative' : null}
          onClick={totalImpayes > 0 ? () => navigate('flux', { tab: 'relances' }) : undefined}
        />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5">
        {/* Left column */}
        <div className="flex flex-col gap-3.5">
          {/* À traiter */}
          <Card style={{ padding: '24px' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="m-0 text-[15px] font-bold" style={{ color: NAVY }}>À traiter</h3>
              <span className="text-[12px]" style={{ color: FAINT }}>
                {aTraiter.length} élément{aTraiter.length > 1 ? 's' : ''}
              </span>
            </div>
            {aTraiter.length === 0 ? (
              <div
                className="rounded-[12px] px-4 py-6 text-center text-[13px]"
                style={{ background: '#e3efe7', color: POSITIVE }}
              >
                <Check size={22} className="mx-auto mb-2" />
                Rien à traiter — tout est à jour.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {aTraiter.map((a, i) => {
                  const isRevision = a.kind === 'revision'
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3.5 rounded-[12px] px-4 py-3.5"
                      style={{ background: isRevision ? '#fdf9ef' : '#fff7f6' }}
                    >
                      {isRevision ? (
                        <RefreshCw size={18} style={{ color: AMBER }} className="shrink-0" />
                      ) : (
                        <AlertTriangle size={18} style={{ color: NEGATIVE }} className="shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="m-0 text-[14px] font-semibold truncate" style={{ color: NAVY }}>
                          {a.title}
                        </p>
                        <p className="m-0 mt-0.5 text-[12px]" style={{ color: FAINT }}>
                          {a.detail}
                        </p>
                      </div>
                      <button
                        onClick={a.onAction}
                        className="text-[12px] font-semibold px-3.5 py-2 rounded-[8px] border-0 cursor-pointer transition-colors text-white shrink-0"
                        style={{ background: NAVY }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#243b63')}
                        onMouseLeave={e => (e.currentTarget.style.background = NAVY)}
                      >
                        {a.action}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Trésorerie chart */}
          <Card style={{ padding: '24px' }}>
            <div className="flex justify-between items-center mb-3.5">
              <h3 className="m-0 text-[15px] font-bold" style={{ color: NAVY }}>Trésorerie {currentYear}</h3>
              <span className="text-[12px]" style={{ color: FAINT }}>
                {reel
                  ? <>solde bancaire réel · <strong style={{ color: NAVY }}>{fmt(reel.soldeActuel)}</strong></>
                  : 'projection déclarative — banque non connectée'}
              </span>
            </div>
            <div style={{ width: '100%', height: 150 }}>
              <ResponsiveContainer>
                <LineChart data={treso} margin={{ top: 5, right: 24, bottom: 0, left: 16 }}>
                  <XAxis
                    dataKey="mois"
                    tick={{ fontSize: 11, fill: FAINT }}
                    axisLine={false}
                    tickLine={false}
                    interval={reel ? 0 : 1}
                  />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip
                    formatter={v => [fmt(v), 'Solde']}
                    labelFormatter={(label, payload) =>
                      payload?.[0]?.payload?.date ? `Au ${payload[0].payload.date}` : label}
                    contentStyle={{
                      borderRadius: 8,
                      border: `1px solid ${BORDER}`,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="solde"
                    stroke={BRAND}
                    strokeWidth={2.5}
                    dot={reel ? { fill: BRAND, r: 3 } : false}
                    connectNulls={false}
                  />
                  {!reel && treso[currentMonth]?.solde != null && (
                    <ReferenceDot x={MONTHS_SHORT[currentMonth]} y={treso[currentMonth].solde} r={4} fill={BRAND} stroke="none" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3.5">
          {/* Traité cette nuit */}
          <Card style={{ padding: '24px' }}>
            <h3 className="m-0 mb-3.5 text-[15px] font-bold flex items-center gap-2" style={{ color: NAVY }}>
              <Sparkles size={15} style={{ color: BRAND }} />
              Traité cette nuit
            </h3>
            <div className="flex flex-col gap-2.5 text-[13px]">
              {rapprochesAuto > 0 && (
                <div className="flex gap-2.5 items-start">
                  <Check size={15} style={{ color: POSITIVE, marginTop: 2 }} className="shrink-0" />
                  <p className="m-0 leading-[1.5]" style={{ color: '#39414d' }}>
                    <strong>{rapprochesAuto} virement{rapprochesAuto > 1 ? 's' : ''}</strong> rapproché{rapprochesAuto > 1 ? 's' : ''} automatiquement d'une échéance.
                  </p>
                </div>
              )}
              {courriersAuto > 0 && (
                <div className="flex gap-2.5 items-start">
                  <Check size={15} style={{ color: POSITIVE, marginTop: 2 }} className="shrink-0" />
                  <p className="m-0 leading-[1.5]" style={{ color: '#39414d' }}>
                    <strong>{courriersAuto} courrier{courriersAuto > 1 ? 's' : ''}</strong> (quittances, avis, relances) parti{courriersAuto > 1 ? 's' : ''} automatiquement.
                  </p>
                </div>
              )}
              {bankConnection?.status === 'connected' ? (
                <div className="flex gap-2.5 items-start">
                  <Check size={15} style={{ color: POSITIVE, marginTop: 2 }} className="shrink-0" />
                  <p className="m-0 leading-[1.5]" style={{ color: '#39414d' }}>
                    Compte <strong>{bankConnection.institution_name || 'bancaire'}</strong> connecté —{' '}
                    <button
                      onClick={() => navigate('flux', { tab: 'banque' })}
                      className="p-0 border-none bg-transparent cursor-pointer font-semibold"
                      style={{ color: BRAND }}
                    >
                      voir les mouvements
                    </button>
                  </p>
                </div>
              ) : (
                <div className="flex gap-2.5 items-start">
                  <CircleDashed size={15} style={{ color: AMBER, marginTop: 2 }} className="shrink-0" />
                  <p className="m-0 leading-[1.5]" style={{ color: '#39414d' }}>
                    Connectez votre banque pour activer le rapprochement automatique.{' '}
                    <button
                      onClick={() => navigate('parametres', { tab: 'banque' })}
                      className="p-0 border-none bg-transparent cursor-pointer font-semibold"
                      style={{ color: BRAND }}
                    >
                      Configurer
                    </button>
                  </p>
                </div>
              )}
              {rapprochesAuto === 0 && courriersAuto === 0 && (
                <div className="flex gap-2.5 items-start">
                  <Check size={15} style={{ color: FAINT, marginTop: 2 }} className="shrink-0" />
                  <p className="m-0 leading-[1.5]" style={{ color: FAINT }}>
                    Aucun traitement automatique ces dernières 24 h.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Opportunité de la semaine (placeholder si aucune veille) */}
          <Card style={{ padding: '24px' }}>
            <div className="flex justify-between items-center mb-3.5">
              <h3 className="m-0 text-[15px] font-bold" style={{ color: NAVY }}>Opportunité de la semaine</h3>
            </div>
            {oppSemaine ? (
              <div className="text-[13px] leading-[1.5]">
                <p className="m-0 font-semibold" style={{ color: NAVY }}>
                  {oppSemaine.adresse || 'Adresse à confirmer'}{oppSemaine.ville ? ` — ${oppSemaine.ville}` : ''}
                </p>
                <p className="m-0 mt-1" style={{ color: '#39414d' }}>
                  {oppSemaine.type_offre === 'location'
                    ? (oppSemaine.loyer_annuel ? `${fmt(oppSemaine.loyer_annuel)}/an` : 'Loyer : nous consulter')
                    : (oppSemaine.prix ? fmt(oppSemaine.prix) : 'Prix : nous consulter')}
                  {oppSemaine.rendement_brut != null && (
                    <> · <strong style={{ color: POSITIVE }}>{String(oppSemaine.rendement_brut).replace('.', ',')} % brut</strong></>
                  )}
                  {oppSemaine.score != null && ` · score ${oppSemaine.score}/100`}
                </p>
                <p className="m-0 mt-0.5 text-[11px]" style={{ color: FAINT }}>
                  {oppSemaine.recherche} · veille du {oppSemaine.decouvert_le ? new Date(oppSemaine.decouvert_le).toLocaleDateString('fr-FR') : '—'}
                </p>
              </div>
            ) : (
              <p className="m-0 text-[13px] leading-[1.5]" style={{ color: FAINT }}>
                Aucune opportunité active dans la veille pour l'instant.
              </p>
            )}
            <button
              onClick={() => navigate('opportunites')}
              className="mt-3.5 w-full text-[13px] font-semibold py-2.5 rounded-[10px] border-none cursor-pointer transition-colors flex items-center justify-center gap-1.5"
              style={{ background: '#eef2fb', color: BRAND }}
            >
              Aller au pipeline <ArrowUpRight size={14} />
            </button>
          </Card>

          {/* Encaissé progress */}
          <Card style={{ padding: '20px 24px' }}>
            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between text-[13px]">
                <span style={{ color: FAINT }}>Encaissé {currentYear}</span>
                <span className="num font-bold" style={{ color: NAVY }}>{fmt(encaisse)}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#eef0f4' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: 'linear-gradient(90deg,#3f6ad8,#5f8ae8)',
                  }}
                />
              </div>
              <div className="flex justify-between text-[12px]" style={{ color: FAINT }}>
                <span>{pct} % de l'attendu à date{encaisseReel != null ? ' · réel (banque)' : ' · déclaré'}</span>
                <span>{fmt(attendu)} TTC attendus (mois échus)</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
