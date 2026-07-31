import { useState, useMemo } from 'react'
import { Calendar, Landmark, MoreHorizontal, Send, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/Auth'
import { useSociete } from '../contexts/Societe'
import { fmt, fmtDate, MONTHS, getLoyerPourMois, today } from '../lib/utils'
import { suiviLoyers } from '../lib/calculs'
import {
  pdfAvisEcheance, pdfFacture, pdfQuittance, pdfRelance, pdfMiseEnDemeure, pdfCommandement,
} from '../lib/pdf'
import { Card, Empty, Kpi, KpiRow, Modal } from '../components/UI'
import { libelleCategorie } from '../lib/categoriesBancaires'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

const now = new Date()

const TYPE_LABELS = {
  quittance: 'Quittance',
  avis_echeance: "Avis d'échéance",
  facture: 'Facture',
  relance: 'Relance',
  mise_en_demeure: 'Mise en demeure',
  commandement: 'Commandement de payer',
}

// Le suivi des loyers : une ligne par mois et par bail, du montant dû au
// dernier courrier parti. Remplace les onglets Échéancier, Écarts,
// Transactions et Relances, qui montraient les mêmes échéances sous des
// angles séparés sans jamais les réunir.
export default function SuiviLoyers({ navigate }) {
  const { user } = useAuth()
  const {
    baux, biens, locataires, transactions, bankTransactions, bankAccounts,
    courriers, envoisConfig, selected, canEdit, reload,
  } = useSociete()
  const [annee, setAnnee] = useState(now.getFullYear())
  const [busy, setBusy] = useState(null) // `${bailId}-${mois}` pendant un envoi
  const [menuOuvert, setMenuOuvert] = useState(null)
  const [rattacher, setRattacher] = useState(null) // { bail, ligne } pendant un rattachement

  const annees = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
  const banqueConnectee = bankAccounts.length > 0

  const suivi = useMemo(
    () => suiviLoyers({ baux, biens, transactions, bankTransactions, courriers, annee }),
    [baux, biens, transactions, bankTransactions, courriers, annee],
  )

  const relanceJ = envoisConfig?.relance_apres_jours ?? 5
  const medJ = envoisConfig?.mise_en_demeure_apres_jours ?? 15

  const contexte = (bail) => ({
    loc: locataires.find(l => l.id === bail.locataire_id),
    bien: biens.find(b => b.id === bail.bien_id),
  })

  const nomBail = (bail) => {
    const { loc, bien } = contexte(bail)
    const nom = loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || 'Locataire'
    return `${nom} — ${bien?.reference || bien?.adresse || ''}`
  }

  // ── Actions ───────────────────────────────────────────────────

  const journaliser = async (bail, ech, type, mois) => {
    await supabase.from('courriers_envoyes').insert({
      societe_id: selected.id, bail_id: bail.id, transaction_id: ech?.id || null,
      type, mois, annee, canal: 'manuel', statut: 'envoye',
      sujet: `${TYPE_LABELS[type]} — PDF généré`, envoye_par: user?.id || null,
    })
  }

  // Assure l'existence de l'échéance du mois avant d'agir dessus.
  const echeanceDuMois = async (bail, ligne, statut = 'impayé') => {
    if (ligne.ech) return ligne.ech
    const { data } = await supabase.from('transactions').insert({
      societe_id: selected.id, bail_id: bail.id, mois: ligne.mois, annee,
      montant_loyer: getLoyerPourMois(bail, ligne.mois, annee),
      montant_charges: bail.charges || 0,
      statut, date_paiement: statut === 'payé' ? today() : null, relance_count: 0,
    }).select().single()
    return data
  }

  const envoyerEmail = async (bail, ligne, type) => {
    const cle = `${bail.id}-${ligne.mois}`
    setBusy(cle)
    try {
      const ech = (type === 'relance' || type === 'mise_en_demeure' || type === 'quittance')
        ? await echeanceDuMois(bail, ligne, ligne.ech?.statut || 'impayé')
        : ligne.ech
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${FUNCTIONS_URL}/auto-documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          mode: 'envoyer', type,
          transaction_id: ech?.id || undefined,
          bail_id: bail.id, mois: ligne.mois, annee,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'envoi échoué')
      alert(`${TYPE_LABELS[type]} envoyé(e) à ${json.destinataire}`)
    } catch (e) {
      alert(`Envoi impossible : ${e.message}`)
    } finally {
      setBusy(null)
      reload()
    }
  }

  const expliquerEcart = async (ligne) => {
    const mvt = ligne.mouvements[0]
    if (!mvt) return
    const motif = prompt(
      `Dû ${fmt(ligne.attendu)}, reçu ${fmt(ligne.recu)} (${fmt(ligne.ecart)}).\nMotif de l'écart (régularisation de charges, paiement partiel…) :`,
      ligne.motifEcart || '',
    )
    if (motif === null) return
    await supabase.from('bank_transactions').update({ motif_ecart: motif || null }).eq('id', mvt.id)
    reload()
  }

  // Crédits sans échéance en face, rattachables depuis une ligne du tableau :
  // tout ce qui est entré sans être ni rapproché ni ignoré, quelle que soit
  // l'année (un loyer de janvier peut arriver fin décembre).
  const creditsARattacher = useMemo(
    () => bankTransactions
      .filter(t => Number(t.amount) > 0 && !t.transaction_id && t.statut_rapprochement !== 'ignore')
      .sort((a, b) => (b.booking_date || '').localeCompare(a.booking_date || '')),
    [bankTransactions],
  )

  // Lie un virement reçu à l'échéance d'une ligne — le geste inverse de
  // l'écran Banque : on part du mois dû, on choisit l'argent qui le règle.
  const rattacherVirement = async (mvt) => {
    const { bail, ligne } = rattacher
    const ech = await echeanceDuMois(bail, ligne, 'payé')
    if (!ech) return
    const { error } = await supabase.from('bank_transactions').update({
      statut_rapprochement: 'rapproche_manuel',
      transaction_id: ech.id,
      categorie: null,
      suggestions: null,
      motif_ecart: null,
      rapproche_le: new Date().toISOString(),
      rapproche_par: user?.id || null,
    }).eq('id', mvt.id)
    if (error) { alert(`Rattachement impossible : ${error.message}`); return }
    await supabase.from('transactions')
      .update({ statut: 'payé', date_paiement: mvt.booking_date })
      .eq('id', ech.id)
    setRattacher(null)
    reload()
  }

  const marquerPaye = async (bail, ligne) => {
    if (ligne.ech) {
      await supabase.from('transactions').update({ statut: 'payé', date_paiement: today() }).eq('id', ligne.ech.id)
    } else {
      await echeanceDuMois(bail, ligne, 'payé')
    }
    reload()
  }

  const genererPdf = async (bail, ligne, type) => {
    const { loc, bien } = contexte(bail)
    if (!loc || !bien) return
    const soc = selected
    if (type === 'avis_echeance') pdfAvisEcheance(bail, bien, loc, soc, ligne.mois, annee)
    else if (type === 'facture') pdfFacture(bail, bien, loc, soc, ligne.mois, annee)
    else if (type === 'quittance' && ligne.ech) pdfQuittance(bail, bien, loc, soc, ligne.ech)
    else if (type === 'relance') pdfRelance(bail, bien, loc, soc, transactions)
    else if (type === 'mise_en_demeure') pdfMiseEnDemeure(bail, bien, loc, soc, transactions)
    else if (type === 'commandement') pdfCommandement(bail, bien, loc, soc, transactions)
    await journaliser(bail, ligne.ech, type, ligne.mois)
    setMenuOuvert(null)
    reload()
  }

  // ── Rendu ─────────────────────────────────────────────────────

  const tauxGlobal = suivi.total.attenduADate > 0
    ? Math.round(suivi.total.recu / suivi.total.attenduADate * 100) : 0
  const courriersEnvoyes = suivi.courriersAnnee.filter(c => c.statut === 'envoye')
  const horsEcheanceTotal = suivi.horsEcheance.reduce((s, t) => s + Number(t.amount || 0), 0)

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-navy mb-0.5">Suivi des loyers</h1>
          <p className="text-gray-400 text-sm">
            Une ligne par mois : le dû, l'encaissé, l'écart, le courrier —
            <strong className="text-gray-500"> montants TTC</strong>
          </p>
        </div>
        <div className="flex gap-2">
          {annees.map(y => (
            <button key={y} onClick={() => setAnnee(y)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
                annee === y ? 'bg-navy text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
              }`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {!banqueConnectee && (
        <Card className="p-4 mb-6 border-amber-200 bg-amber-50/40">
          <div className="flex items-start gap-3">
            <Landmark size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-navy">Aucun compte bancaire connecté</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Sans connexion bancaire, l'encaissement réel est inconnu : tout ce qui
                s'affiche « reçu » repose sur le déclaratif.{' '}
                <button onClick={() => navigate?.('parametres', { tab: 'banque' })}
                  className="font-semibold text-blue-500 hover:underline cursor-pointer">
                  Connecter la banque
                </button>
              </p>
            </div>
          </div>
        </Card>
      )}

      <KpiRow cols={5} className="mb-3">
        <Kpi label={`Attendu ${annee}`} value={fmt(suivi.total.attendu)} tone="brand"
          sub="Loyers et charges des baux en cours" />
        <Kpi label="Réellement encaissé" value={fmt(suivi.total.recu)} tone="positive"
          sub={`${tauxGlobal} % de l'attendu à date`} />
        <Kpi label="Écart à ce jour" value={fmt(suivi.total.ecart)}
          tone={suivi.total.ecart < -0.01 ? 'negative' : 'positive'}
          sub={suivi.total.moisSansVirement > 0
            ? `Dont ${suivi.total.moisSansVirement} mois sans virement`
            : 'Échéances dues couvertes'} />
        <Kpi label="Reçu hors échéance" value={fmt(horsEcheanceTotal)} tone="warn"
          sub={`${suivi.horsEcheance.length} virement${suivi.horsEcheance.length > 1 ? 's' : ''} à affecter`} />
        <Kpi label="Courriers envoyés" value={courriersEnvoyes.length}
          sub={envoisConfig ? 'Envois automatiques paramétrés' : 'Envois automatiques non paramétrés'} />
      </KpiRow>
      <p className="text-xs text-gray-400 mb-8">
        Les envois (quittances, avis, relances) partent de contact@wbpartners.fr.{' '}
        <button onClick={() => navigate?.('parametres', { tab: 'envois' })}
          className="font-semibold text-blue-500 hover:underline cursor-pointer">
          Paramétrer les envois automatiques
        </button>
      </p>

      {suivi.parBail.length === 0 ? (
        <Empty icon={<Calendar size={40} />} text="Aucun bail actif sur un bien acquis." />
      ) : suivi.parBail.map(({ bail, lignes, totaux }) => (
        <Card key={bail.id} className="mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-bold text-navy">{nomBail(bail)}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {fmt((Number(bail.loyer_ht || 0) + Number(bail.charges || 0)) * (bail.tva_applicable === false ? 1 : 1 + Number(bail.taux_tva ?? 20) / 100))} TTC / mois
              {bail.date_fin ? ` · bail jusqu'au ${fmtDate(bail.date_fin)}` : ''}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 920 }}>
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Mois</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Attendu</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Reçu en banque</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Encaissement</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Écart</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Dernier courrier</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lignes.filter(l => l.verdict !== 'horsBail').map(ligne => (
                  <LigneMois key={ligne.mois} bail={bail} ligne={ligne} annee={annee}
                    canEdit={canEdit} busy={busy === `${bail.id}-${ligne.mois}`}
                    menuOuvert={menuOuvert === `${bail.id}-${ligne.mois}`}
                    onMenu={() => setMenuOuvert(menuOuvert === `${bail.id}-${ligne.mois}` ? null : `${bail.id}-${ligne.mois}`)}
                    relanceJ={relanceJ} medJ={medJ}
                    onEmail={type => envoyerEmail(bail, ligne, type)}
                    onPdf={type => genererPdf(bail, ligne, type)}
                    onEcart={() => expliquerEcart(ligne)}
                    onPaye={() => marquerPaye(bail, ligne)}
                    nbCandidats={creditsARattacher.length}
                    onRattacher={() => setRattacher({ bail, ligne })} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-100 bg-gray-50 font-bold">
                  <td className="px-4 py-3 text-navy text-sm">Total {annee}</td>
                  <td className="px-4 py-3 text-right text-navy text-sm">{fmt(totaux.attendu)}</td>
                  <td className="px-4 py-3 text-emerald-600 text-sm">{fmt(totaux.recu)}</td>
                  <td className="px-4 py-3"><Jauge pct={totaux.attenduADate > 0 ? totaux.recu / totaux.attenduADate : 0} /></td>
                  <td className="px-4 py-3">
                    <BadgeEcart valeur={totaux.ecart} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400" colSpan={2}>
                    Écart calculé sur les mois échus uniquement
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ))}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
        <Card className="p-5">
          <h3 className="text-sm font-bold text-navy flex items-center gap-2 mb-1">
            Reçu sans échéance en face
            <span className="text-xs font-semibold text-gray-300">{suivi.horsEcheance.length}</span>
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            De l'argent est entré sans correspondre à un loyer attendu. À qualifier
            pour qu'il cesse de fausser le rapprochement.
          </p>
          {suivi.horsEcheance.length === 0 ? (
            <p className="text-xs text-gray-300 italic">Tous les crédits de l'année sont rattachés.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {suivi.horsEcheance.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-600 truncate">
                    <strong className="text-navy">{fmtDate(t.booking_date)}</strong>
                    {' · '}{(t.remittance_information || t.counterparty_name || '—').slice(0, 60)}
                    {t.categorie ? <span className="text-xs text-gray-400"> · {libelleCategorie(t.categorie)}</span> : ''}
                  </span>
                  <span className="text-sm font-semibold text-navy whitespace-nowrap">{fmt(Number(t.amount))}</span>
                </div>
              ))}
            </div>
          )}
          {suivi.horsEcheance.length > 0 && (
            <button onClick={() => navigate?.('flux', { tab: 'banque' })}
              className="mt-3 text-xs font-semibold text-blue-500 hover:underline cursor-pointer">
              Qualifier dans Banque
            </button>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold text-navy flex items-center gap-2 mb-1">
            Courriers envoyés en {annee}
            <span className="text-xs font-semibold text-gray-300">{courriersEnvoyes.length}</span>
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            Relances, mises en demeure, quittances — avec leur date et leur canal.
          </p>
          {courriersEnvoyes.length === 0 ? (
            <p className="text-xs text-gray-300 italic">Rien n'a encore été envoyé sur cet exercice.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {courriersEnvoyes.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-600 truncate">
                    <strong className="text-navy">{TYPE_LABELS[c.type] || c.type}</strong>
                    {c.mois != null && ` · ${MONTHS[c.mois]}${c.annee ? ` ${c.annee}` : ''}`}
                    {c.destinataire ? ` · ${c.destinataire}` : ''}
                  </span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {fmtDate(c.envoye_le)} · {c.canal === 'email' ? (c.envoye_par ? 'email' : 'email auto') : 'PDF'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {rattacher && (
        <Modal
          title={`Rattacher un virement — ${MONTHS[rattacher.ligne.mois]} ${annee}`}
          onClose={() => setRattacher(null)}
          width="max-w-2xl"
        >
          <p className="text-sm text-gray-500 mb-1">
            {nomBail(rattacher.bail)} — dû <strong className="text-navy">{fmt(rattacher.ligne.attendu)}</strong> TTC.
          </p>
          <p className="text-xs text-gray-400 mb-4">
            Choisissez le virement qui règle ce mois. Si le montant diffère,
            la ligne passera en « écart à expliquer ».
          </p>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {creditsARattacher.map(t => {
              const proche = rattacher.ligne.attendu > 0
                && Math.abs(Number(t.amount) - rattacher.ligne.attendu) / rattacher.ligne.attendu <= 0.05
              return (
                <button key={t.id} onClick={() => rattacherVirement(t)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 bg-gray-50 hover:bg-blue-50/60 border border-transparent hover:border-blue-200 cursor-pointer text-left transition-colors">
                  <span className="text-sm text-gray-600 truncate">
                    <strong className="text-navy">{fmtDate(t.booking_date)}</strong>
                    {' · '}{(t.remittance_information || t.counterparty_name || '—').slice(0, 55)}
                    {t.categorie && (
                      <span className="text-xs text-gray-400"> · {libelleCategorie(t.categorie)}</span>
                    )}
                  </span>
                  <span className={`text-sm font-semibold whitespace-nowrap ${proche ? 'text-emerald-600' : 'text-navy'}`}>
                    {fmt(Number(t.amount))}
                  </span>
                </button>
              )
            })}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Une ligne du tableau ─────────────────────────────────────────

const VERDICT_DOT = {
  ok: 'bg-green-500', watch: 'bg-amber-400', flag: 'bg-red-500', futur: 'bg-gray-200',
  // Déclaré payé à la main, aucun virement en face : ni vert (pas confirmé),
  // ni rouge (pas un impayé) — à rattacher.
  declare: 'bg-amber-300',
}

function LigneMois({
  bail, ligne, annee, canEdit, busy, menuOuvert, onMenu,
  relanceJ, medJ, onEmail, onPdf, onEcart, onPaye, nbCandidats, onRattacher,
}) {
  const retardJours = Math.floor((now - new Date(annee, ligne.mois, 1)) / 86400000)
  const palier = retardJours >= medJ ? 'mise_en_demeure' : 'relance'
  const enCours = ligne.mois === now.getMonth() && annee === now.getFullYear()

  const pctRecu = ligne.attendu > 0 ? ligne.recu / ligne.attendu : 0

  return (
    <tr className="border-t border-gray-50">
      <td className="px-4 py-3">
        <span className="flex items-center gap-2.5 whitespace-nowrap">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${VERDICT_DOT[ligne.verdict]}`} />
          <span className="font-bold text-navy text-sm">{MONTHS[ligne.mois]}</span>
          {enCours && <span className="text-[10px] font-bold uppercase text-blue-500">en cours</span>}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-semibold text-navy text-sm whitespace-nowrap">
        {fmt(ligne.attendu)}
      </td>
      <td className="px-4 py-3">
        {ligne.recu > 0 ? (
          <>
            <span className="font-semibold text-sm text-navy">{fmt(ligne.recu)}</span>
            <span className="text-xs text-gray-400 ml-1.5">
              le {fmtDate(ligne.mouvements[0]?.booking_date)}
            </span>
            <div className="mt-1"><PillQualification q={ligne.qualification} /></div>
          </>
        ) : ligne.futur ? (
          <span className="text-xs text-gray-300 italic">À venir</span>
        ) : (
          <>
            <span className="text-xs text-gray-400 italic">Aucun virement</span>
            <div className="mt-1"><PillQualification q={ligne.qualification} /></div>
          </>
        )}
      </td>
      <td className="px-4 py-3"><Jauge pct={ligne.futur ? null : pctRecu} /></td>
      <td className="px-4 py-3">
        {ligne.futur ? <span className="text-gray-300 text-xs">—</span> : (
          <>
            <BadgeEcart valeur={ligne.ecart} />
            {ligne.motifEcart && (
              <div className="text-[11px] text-gray-400 mt-1 max-w-[160px] truncate" title={ligne.motifEcart}>
                {ligne.motifEcart}
              </div>
            )}
          </>
        )}
      </td>
      <td className="px-4 py-3">
        {ligne.courrier ? (
          <span className="text-xs">
            <span className="font-semibold text-navy">{TYPE_LABELS[ligne.courrier.type] || ligne.courrier.type}</span>
            <span className="text-gray-400"> · {fmtDate(ligne.courrier.envoye_le)}</span>
            <span className="text-gray-300"> · {ligne.courrier.canal === 'email' ? (ligne.courrier.envoye_par ? 'email' : 'auto') : 'PDF'}</span>
          </span>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {canEdit && (
          <div className="flex items-center gap-1.5 relative">
            {!ligne.futur && ligne.verdict === 'flag' && retardJours >= relanceJ && (
              <BoutonAction disabled={busy} onClick={() => onEmail(palier)} tone="danger">
                <Send size={11} className="mr-1" />
                {busy ? 'Envoi…' : palier === 'mise_en_demeure' ? 'Mise en demeure' : 'Relancer'}
              </BoutonAction>
            )}
            {!ligne.futur && ligne.verdict === 'watch' && (
              <BoutonAction disabled={busy} onClick={onEcart} tone="brand">
                {ligne.motifEcart ? 'Modifier le motif' : "Expliquer l'écart"}
              </BoutonAction>
            )}
            {!ligne.futur && ligne.verdict === 'ok' && ligne.ech && (
              <BoutonAction disabled={busy} onClick={() => onEmail('quittance')} tone="quiet">
                <Send size={11} className="mr-1" />{busy ? 'Envoi…' : 'Quittance'}
              </BoutonAction>
            )}
            {!ligne.futur && ligne.recu === 0 && nbCandidats > 0 && (
              <BoutonAction disabled={busy} onClick={onRattacher} tone="quiet">
                Rattacher un virement
              </BoutonAction>
            )}
            {!ligne.futur && ligne.verdict === 'flag' && ligne.qualification === 'aucun' && (
              <BoutonAction disabled={busy} onClick={onPaye} tone="quiet">Marquer payé</BoutonAction>
            )}
            <button onClick={onMenu}
              className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 cursor-pointer"
              title="Générer un document PDF">
              <MoreHorizontal size={15} />
            </button>
            {menuOuvert && (
              <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 w-56">
                <p className="px-3 py-1 text-[10px] font-bold uppercase text-gray-300">Documents PDF</p>
                {[
                  ['avis_echeance', true],
                  ['facture', true],
                  ['quittance', !!ligne.ech && ligne.ech.statut === 'payé'],
                  ['relance', true],
                  ['mise_en_demeure', true],
                  ['commandement', true],
                ].filter(([, ok]) => ok).map(([type]) => (
                  <button key={type} onClick={() => onPdf(type)}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer flex items-center gap-2">
                    <FileText size={13} className="text-gray-300" />
                    {TYPE_LABELS[type]}
                  </button>
                ))}
                <p className="px-3 pt-1.5 pb-0.5 text-[10px] text-gray-300 border-t border-gray-50 mt-1">
                  Le commandement se signifie par commissaire de justice — jamais envoyé par email.
                </p>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

function BoutonAction({ children, tone = 'brand', ...p }) {
  const tones = {
    brand: 'text-blue-500 border-blue-100 bg-blue-50/60 hover:bg-blue-50',
    danger: 'text-red-500 border-red-100 bg-red-50/60 hover:bg-red-50',
    quiet: 'text-gray-500 border-gray-200 bg-white hover:bg-gray-50',
  }
  return (
    <button {...p}
      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border cursor-pointer whitespace-nowrap inline-flex items-center disabled:opacity-50 transition-colors ${tones[tone]}`}>
      {children}
    </button>
  )
}

function PillQualification({ q }) {
  const cfg = {
    rapproche_auto: ['bg-blue-50 text-blue-500 border-blue-100', "Rapproché par l'IA"],
    rapproche_manuel: ['bg-emerald-50 text-emerald-600 border-emerald-100', 'Rapproché à la main'],
    declare: ['bg-amber-50 text-amber-600 border-amber-100', 'Déclaré à la main'],
    aucun: ['bg-gray-50 text-gray-400 border-gray-100', 'Non payé'],
  }
  const [cls, label] = cfg[q] || cfg.aucun
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

function Jauge({ pct }) {
  if (pct === null) return <span className="text-gray-300 text-xs">—</span>
  const p = Math.max(0, Math.min(1, pct))
  const couleur = p >= 0.999 ? 'bg-green-500' : p > 0 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div style={{ width: 130 }}>
      <div className="text-[11px] text-gray-400 mb-1">{Math.round(p * 100)} %</div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${couleur}`} style={{ width: `${p * 100}%` }} />
      </div>
    </div>
  )
}

function BadgeEcart({ valeur }) {
  if (Math.abs(valeur) < 0.02) {
    return <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-50 text-gray-300">—</span>
  }
  const neg = valeur < 0
  return (
    <span className={`inline-block text-[13px] font-extrabold px-2.5 py-1 rounded-lg whitespace-nowrap ${
      neg ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'
    }`}>
      {neg ? '' : '+'}{fmt(valeur)}
    </span>
  )
}
