import { useMemo } from 'react'
import {
  AlertTriangle, RefreshCw, Sparkles, Check, CircleDashed, ArrowUpRight,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import { useAuth } from '../contexts/Auth'
import { useSociete } from '../contexts/Societe'
import { fmt, MONTHS_SHORT, getLoyerActuel } from '../lib/utils'
import { agregatsBiens, partSociete, estAcquis } from '../lib/calculs'

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
  const { biens, locataires, baux, transactions, bienActionnaires, bankConnection } = useSociete()

  const bauxActifs = baux.filter(b => b.actif)

  // ── KPIs ────────────────────────────────────────────────────
  // Pondérés par la quote-part réellement détenue par la société : un bien
  // détenu à 50 % ne pèse que pour moitié dans le patrimoine et le cashflow.
  const agg = agregatsBiens(biens, bienActionnaires)
  const valeurPatrimoine = agg.valeurNette
  const cashflowMensualise = agg.cashflowNet
  // Un bail rattaché à un bien non encore acquis ne produit aucun loyer.
  const loyersMensuels = bauxActifs.reduce((s, b) => {
    const bien = biens.find(x => x.id === b.bien_id)
    if (bien && !estAcquis(bien)) return s
    const part = partSociete(b.bien_id, bienActionnaires)
    return s + (getLoyerActuel(b) || b.loyer_ht || 0) * part
  }, 0)
  const impayes = transactions.filter(t => t.statut === 'impayé')
  const totalImpayes = impayes.reduce((s, t) => s + (t.montant_loyer || 0) + (t.montant_charges || 0), 0)

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

  // ── Trésorerie 2026 (solde cumulé projeté) ─────────────────
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const treso = useMemo(() => {
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
  }, [transactions, biens, bienActionnaires, currentYear])

  // ── Traité cette nuit (simulé depuis données réelles) ──────
  const rapprochesJuillet = transactions.filter(t => t.mois === currentMonth && t.annee === currentYear && t.statut === 'payé').length

  // ── Encaissé 2026 ─────────────────────────────────────────
  const encaisse = transactions
    .filter(t => t.annee === currentYear && t.statut === 'payé')
    .reduce((s, t) => s + (t.montant_loyer || 0) + (t.montant_charges || 0), 0)
  const attendu = loyersMensuels * 12
  const pct = attendu > 0 ? Math.min(100, Math.round((encaisse / attendu) * 100)) : 0

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
    if (st === 'pending') {
      return {
        bg: '#fdf9ef', fg: AMBER,
        label: 'Connexion bancaire à finaliser',
        title: "L'autorisation bancaire n'a pas été menée à son terme — cliquez pour la reprendre",
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
          label="Valeur du patrimoine"
          value={valeurPatrimoine ? fmt(valeurPatrimoine) : '—'}
          hint={
            agg.nbEnCours > 0
              ? `+ ${agg.nbEnCours} en cours d'acquisition (${fmt(agg.valeurEnCours)})`
              : biens.length ? `${biens.length} bien${biens.length > 1 ? 's' : ''}` : null
          }
          hintColor={agg.nbEnCours > 0 ? AMBER : undefined}
        />
        <KpiCard
          label="Loyers mensuels"
          value={fmt(loyersMensuels)}
          hint={bauxActifs.length ? `${bauxActifs.length} bail${bauxActifs.length > 1 ? ' actifs' : ' actif'}` : 'Aucun bail actif'}
        />
        <KpiCard
          label="Cashflow mensuel"
          value={(cashflowMensualise >= 0 ? '+' : '') + fmt(cashflowMensualise)}
          hint="après annuités et charges"
          tone={cashflowMensualise >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          label="Impayés"
          value={totalImpayes > 0 ? fmt(totalImpayes) : '0 €'}
          hint={impayes.length ? `${impayes.length} échéance${impayes.length > 1 ? 's' : ''} en retard` : 'À jour'}
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
              <span className="text-[12px]" style={{ color: FAINT }}>solde cumulé projeté</span>
            </div>
            <div style={{ width: '100%', height: 150 }}>
              <ResponsiveContainer>
                <LineChart data={treso} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="mois"
                    tick={{ fontSize: 11, fill: FAINT }}
                    axisLine={false}
                    tickLine={false}
                    interval={1}
                  />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip
                    formatter={v => fmt(v)}
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
                    dot={false}
                  />
                  <ReferenceDot x={MONTHS_SHORT[currentMonth]} y={treso[currentMonth]?.solde} r={4} fill={BRAND} stroke="none" />
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
              {rapprochesJuillet > 0 && (
                <div className="flex gap-2.5 items-start">
                  <Check size={15} style={{ color: POSITIVE, marginTop: 2 }} className="shrink-0" />
                  <p className="m-0 leading-[1.5]" style={{ color: '#39414d' }}>
                    <strong>{rapprochesJuillet} loyer{rapprochesJuillet > 1 ? 's' : ''}</strong> de {MONTHS_SHORT[currentMonth].toLowerCase()} rapproché{rapprochesJuillet > 1 ? 's' : ''} automatiquement.
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
              {rapprochesJuillet === 0 && (
                <div className="flex gap-2.5 items-start">
                  <Check size={15} style={{ color: POSITIVE, marginTop: 2 }} className="shrink-0" />
                  <p className="m-0 leading-[1.5]" style={{ color: '#39414d' }}>
                    Rien à traiter cette nuit. L'IA surveille en continu.
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
            <p className="m-0 text-[13px] leading-[1.5]" style={{ color: FAINT }}>
              Configurez votre veille pour découvrir des opportunités.
            </p>
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
                <span>{pct} % de l'attendu</span>
                <span>{fmt(attendu)} attendus</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
