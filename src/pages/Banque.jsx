import { useMemo, useState } from 'react'
import {
  Landmark, RefreshCw, Check, AlertTriangle, EyeOff, Link2, Undo2, Search, Tag,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { useAuth } from '../contexts/Auth'
import { fmt, fmtDate, MONTHS } from '../lib/utils'
import { categoriesPour, libelleCategorie } from '../lib/categoriesBancaires'
import { coefTva, comptesSuivisEur } from '../lib/calculs'
import { PageHeader, Card, Btn, Empty, Modal, Kpi, KpiRow, Sel, Field } from '../components/UI'
// Même module que l'Edge Function : l'empreinte apprise ici doit être
// rigoureusement identique à celle que le moteur recherchera.
import { empreinte } from '../../supabase/functions/_shared/rapprochement.ts'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

const FILTRES = [
  { k: 'a_qualifier', l: 'À qualifier' },
  { k: 'rapproches', l: 'Rapprochés' },
  { k: 'classes', l: 'Classés' },
  { k: 'ignores', l: 'Ignorés' },
  { k: 'tous', l: 'Tous' },
]

export default function Banque({ navigate }) {
  const { user } = useAuth()
  const {
    selected, bankConnection, bankAccounts, bankTransactions,
    baux, locataires, biens, transactions, canEdit, reload,
  } = useSociete()

  const [filtre, setFiltre] = useState('a_qualifier')
  const [syncing, setSyncing] = useState(false)
  const [erreur, setErreur] = useState('')
  const [resultat, setResultat] = useState(null)
  const [qualifier, setQualifier] = useState(null)   // mouvement en cours de qualification
  const [recherche, setRecherche] = useState('')

  const connecte = bankConnection?.status === 'connected'

  // ── Libellés d'échéance ────────────────────────────────
  const libelleEcheance = (echId) => {
    const ech = transactions.find(t => t.id === echId)
    if (!ech) return 'Échéance inconnue'
    const bail = baux.find(b => b.id === ech.bail_id)
    const loc = bail ? locataires.find(l => l.id === bail.locataire_id) : null
    const bien = bail ? biens.find(b => b.id === bail.bien_id) : null
    const nom = loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || 'Locataire'
    return `${nom} — ${MONTHS[ech.mois]} ${ech.annee}${bien ? ` · ${bien.reference || bien.ville}` : ''}`
  }

  // ── KPI ────────────────────────────────────────────────
  const comptesSuivis = bankAccounts.filter(c => c.suivi !== false)
  // Le solde n'additionne que l'euro : mélanger les devises n'aurait aucun
  // sens. Le filtre partagé tolère 'XXX' (devise non renseignée par la
  // banque), qui n'est pas une devise étrangère.
  const eur = comptesSuivisEur(bankAccounts)
  const soldeEur = eur.reduce((s, c) => s + Number(c.solde || 0), 0)
  const autresDevises = comptesSuivis.filter(c => !eur.includes(c))

  const credits = bankTransactions.filter(t => Number(t.amount) > 0)
  const nbRapproches = credits.filter(t => t.statut_rapprochement?.startsWith('rapproche')).length
  const nbAQualifier = credits.filter(t => t.statut_rapprochement === 'a_qualifier').length

  // ── Liste filtrée ──────────────────────────────────────
  const liste = useMemo(() => {
    let l = bankTransactions
    if (filtre === 'a_qualifier') l = l.filter(t => t.statut_rapprochement === 'a_qualifier' && Number(t.amount) > 0)
    else if (filtre === 'rapproches') l = l.filter(t => t.statut_rapprochement?.startsWith('rapproche'))
    else if (filtre === 'classes') l = l.filter(t => t.statut_rapprochement === 'qualifie')
    else if (filtre === 'ignores') l = l.filter(t => t.statut_rapprochement === 'ignore')
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase()
      l = l.filter(t => (t.remittance_information || '').toLowerCase().includes(q) || String(t.amount).includes(q))
    }
    return l
  }, [bankTransactions, filtre, recherche])

  // ── Actions ────────────────────────────────────────────
  const lancerSync = async () => {
    setSyncing(true); setErreur(''); setResultat(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${FUNCTIONS_URL}/banking-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ societe_id: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Synchronisation en échec')
      setResultat(data)
      reload()
    } catch (e) { setErreur(e.message) }
    setSyncing(false)
  }

  // Rapprochement manuel : lie le mouvement à l'échéance, solde celle-ci, et
  // mémorise l'émetteur pour que le prochain virement se rapproche seul.
  const rapprocherManuel = async (mvt, echeanceId, motifEcart = null) => {
    const { error: e1 } = await supabase.from('bank_transactions').update({
      statut_rapprochement: 'rapproche_manuel',
      transaction_id: echeanceId,
      motif_ecart: motifEcart,
      // Un mouvement d'abord classé par nature puis rapproché : la nature
      // n'a plus lieu d'être, l'échéance la porte.
      categorie: null,
      suggestions: null,
      rapproche_le: new Date().toISOString(),
      rapproche_par: user?.id || null,
    }).eq('id', mvt.id)
    if (e1) { setErreur(e1.message); return }

    const { error: e2 } = await supabase.from('transactions').update({
      statut: 'payé',
      date_paiement: mvt.booking_date,
    }).eq('id', echeanceId)
    if (e2) { setErreur(e2.message); return }

    // Apprentissage — best effort : une erreur ici ne doit pas invalider le
    // rapprochement, qui est déjà enregistré.
    const ech = transactions.find(t => t.id === echeanceId)
    const emp = empreinte(mvt.remittance_information)
    if (ech?.bail_id && emp) {
      const { data: existant } = await supabase.from('rapprochement_appris')
        .select('id, occurrences').eq('societe_id', selected.id).eq('empreinte', emp).maybeSingle()
      if (existant) {
        await supabase.from('rapprochement_appris').update({
          bail_id: ech.bail_id,
          occurrences: (existant.occurrences || 1) + 1,
          derniere_utilisation: new Date().toISOString(),
        }).eq('id', existant.id)
      } else {
        await supabase.from('rapprochement_appris').insert({
          societe_id: selected.id,
          bail_id: ech.bail_id,
          empreinte: emp,
        })
      }
    }

    setQualifier(null)
    reload()
  }

  // Annule un rapprochement : l'échéance redevient impayée.
  const annulerRapprochement = async (mvt) => {
    if (!confirm('Annuler ce rapprochement ? L\'échéance repassera en impayé.')) return
    if (mvt.transaction_id) {
      await supabase.from('transactions')
        .update({ statut: 'impayé', date_paiement: null })
        .eq('id', mvt.transaction_id)
    }
    await supabase.from('bank_transactions').update({
      statut_rapprochement: 'a_qualifier',
      transaction_id: null,
      motif_ecart: null,
      score_confiance: null,
      rapproche_le: null,
      rapproche_par: null,
    }).eq('id', mvt.id)
    reload()
  }

  // Classement : le mouvement est qualifié par sa nature, sans échéance en
  // face. C'est le cas de tout ce qui n'est pas un loyer — indemnité, apport,
  // travaux — et que l'on ne veut surtout pas ranger dans « ignoré ».
  const classer = async (mvt, { categorie, bien_id, note }) => {
    const { error } = await supabase.from('bank_transactions').update({
      statut_rapprochement: 'qualifie',
      categorie,
      bien_id: bien_id || null,
      note: note?.trim() || null,
      transaction_id: null,
      suggestions: null,
      rapproche_le: new Date().toISOString(),
      rapproche_par: user?.id || null,
    }).eq('id', mvt.id)
    if (error) { setErreur(error.message); return }
    setQualifier(null)
    reload()
  }

  const ignorer = async (mvt) => {
    await supabase.from('bank_transactions')
      .update({ statut_rapprochement: 'ignore', suggestions: null })
      .eq('id', mvt.id)
    reload()
  }

  const restaurer = async (mvt) => {
    await supabase.from('bank_transactions')
      .update({ statut_rapprochement: 'a_qualifier', categorie: null, bien_id: null, note: null })
      .eq('id', mvt.id)
    reload()
  }

  const basculerSuivi = async (compte) => {
    await supabase.from('bank_accounts')
      .update({ suivi: compte.suivi === false })
      .eq('id', compte.id)
    reload()
  }

  // ── Écran non connecté ─────────────────────────────────
  if (!connecte) {
    return (
      <Card className="p-10 text-center">
        <Landmark size={40} className="text-gray-300 mx-auto mb-4" />
        <p className="font-semibold text-navy mb-1">Aucun compte bancaire connecté</p>
        <p className="text-sm text-gray-400 mb-5 max-w-md mx-auto">
          Connectez le compte de {selected?.nom_affiche || selected?.nom} pour rapprocher
          automatiquement les loyers attendus des virements réellement reçus.
        </p>
        <Btn onClick={() => navigate('parametres', { tab: 'banque' })} className="justify-center">
          <Landmark size={15} /> Connecter un compte
        </Btn>
      </Card>
    )
  }

  return (
    <div>
      <PageHeader
        title="Banque"
        sub={
          bankConnection?.last_sync
            ? `Dernière synchronisation le ${fmtDate(bankConnection.last_sync)}`
            : 'Jamais synchronisé'
        }
      >
        {canEdit && (
          <Btn onClick={lancerSync} disabled={syncing}>
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Synchronisation...' : 'Synchroniser'}
          </Btn>
        )}
      </PageHeader>

      <KpiRow cols={3}>
        <Kpi
          label="Solde des comptes suivis"
          value={fmt(soldeEur)}
          sub={
            autresDevises.length > 0
              ? `+ ${autresDevises.map(c => `${Number(c.solde || 0).toFixed(2)} ${c.currency}`).join(', ')}`
              : `${comptesSuivis.length} compte${comptesSuivis.length > 1 ? 's' : ''} suivi${comptesSuivis.length > 1 ? 's' : ''}`
          }
        />
        <Kpi
          label="Mouvements rapprochés"
          value={`${nbRapproches} / ${nbRapproches + nbAQualifier}`}
          tone="positive"
          sub="Crédits reliés à une échéance"
        />
        <Kpi
          label="À qualifier"
          value={nbAQualifier}
          tone={nbAQualifier > 0 ? 'warn' : 'positive'}
          sub={nbAQualifier > 0 ? 'Nécessitent votre arbitrage' : 'Rien en attente'}
        />
      </KpiRow>

      {resultat && (
        <Card className="p-4 mb-4 border-emerald-200 bg-emerald-50/40">
          <p className="text-sm text-navy">
            <strong>{resultat.mouvements}</strong> mouvements récupérés sur{' '}
            <strong>{resultat.comptes}</strong> comptes —{' '}
            <strong>{resultat.rapproches}</strong> rapprochement{resultat.rapproches > 1 ? 's' : ''} automatique{resultat.rapproches > 1 ? 's' : ''},{' '}
            <strong>{resultat.a_qualifier}</strong> à qualifier.
          </p>
        </Card>
      )}

      {erreur && (
        <Card className="p-4 mb-4 border-red-200 bg-red-50/40">
          <p className="text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle size={15} /> {erreur}
          </p>
        </Card>
      )}

      {/* Comptes */}
      {bankAccounts.length > 0 && (
        <Card className="p-5 mb-4">
          <h3 className="text-sm font-bold text-navy mb-3">Comptes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {bankAccounts.map(c => {
              const suivi = c.suivi !== false
              return (
                <div key={c.id}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 border ${
                    suivi ? 'bg-gray-50 border-gray-100' : 'bg-white border-dashed border-gray-200 opacity-60'
                  }`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">{c.name || 'Compte'}</p>
                    <p className="text-xs text-gray-400">
                      {c.product || '—'} · {Number(c.solde || 0).toFixed(2)} {c.currency || 'EUR'}
                    </p>
                  </div>
                  {canEdit && (
                    <button onClick={() => basculerSuivi(c)}
                      title={suivi ? 'Exclure du rapprochement' : 'Inclure dans le rapprochement'}
                      className="text-xs font-semibold px-2 py-1 rounded-lg cursor-pointer hover:bg-gray-100 flex-shrink-0 text-gray-500">
                      {suivi ? 'Suivi' : 'Ignoré'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {bankAccounts.some(c => (c.currency || 'EUR') !== 'EUR') && (
            <p className="text-xs text-gray-400 mt-3">
              Les comptes en devise étrangère sont exclus du rapprochement des loyers.
            </p>
          )}
        </Card>
      )}

      {/* Filtres + recherche */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {FILTRES.map(f => (
            <button key={f.k} onClick={() => setFiltre(f.k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                filtre === f.k ? 'bg-white text-navy shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}>
              {f.l}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher un libellé ou un montant"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Mouvements */}
      {liste.length === 0 ? (
        <Empty icon={<Landmark size={40} />} text="Aucun mouvement pour ce filtre." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 760 }}>
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Date</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Libellé</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Montant</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Rapprochement</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {liste.map(t => {
                const credit = Number(t.amount) > 0
                const rapproche = t.statut_rapprochement?.startsWith('rapproche')
                const suggestions = Array.isArray(t.suggestions) ? t.suggestions : []
                return (
                  <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(t.booking_date)}</td>
                    <td className="px-4 py-3">
                      <p className="text-navy font-mono text-xs">{t.remittance_information || '—'}</p>
                      {t.currency !== 'EUR' && (
                        <span className="text-[10px] font-bold uppercase text-amber-600">{t.currency}</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                      credit ? 'text-emerald-600' : 'text-navy'
                    }`}>
                      {credit ? '+' : ''}{Number(t.amount).toFixed(2)} {t.currency === 'EUR' ? '€' : t.currency}
                    </td>
                    <td className="px-4 py-3">
                      {rapproche ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            <Check size={11} />
                            {t.statut_rapprochement === 'rapproche_auto' ? 'Rapproché auto' : 'Rapproché'}
                          </span>
                          {t.transaction_id && (
                            <span className="text-xs text-gray-400 truncate max-w-[220px]">
                              {libelleEcheance(t.transaction_id)}
                            </span>
                          )}
                        </div>
                      ) : t.statut_rapprochement === 'qualifie' ? (
                        <div className="flex items-center gap-1.5">
                          {/* Cliquable : un mouvement classé par nature doit
                              pouvoir être rattaché à une échéance après coup. */}
                          <button
                            onClick={() => canEdit && setQualifier(t)}
                            disabled={!canEdit}
                            title="Modifier — ou rattacher à une échéance"
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 cursor-pointer hover:bg-blue-100 disabled:cursor-default">
                            <Tag size={11} />
                            {libelleCategorie(t.categorie)}
                          </button>
                          {t.bien_id && (
                            <span className="text-xs text-gray-400 truncate max-w-[180px]">
                              {(() => {
                                const b = biens.find(x => x.id === t.bien_id)
                                return b?.reference || b?.ville || ''
                              })()}
                            </span>
                          )}
                        </div>
                      ) : t.statut_rapprochement === 'ignore' ? (
                        <span className="text-xs text-gray-400">Ignoré</span>
                      ) : (
                        <button
                          onClick={() => canEdit && setQualifier(t)}
                          disabled={!canEdit}
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full cursor-pointer disabled:cursor-default ${
                            credit
                              ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          <AlertTriangle size={11} />
                          {credit ? 'À qualifier' : 'À classer'}
                          {credit && suggestions.length > 0 && ` · ${suggestions.length} piste${suggestions.length > 1 ? 's' : ''}`}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {canEdit && (
                        rapproche ? (
                          <button onClick={() => annulerRapprochement(t)}
                            title="Annuler le rapprochement"
                            className="text-gray-300 hover:text-red-500 cursor-pointer">
                            <Undo2 size={15} />
                          </button>
                        ) : (t.statut_rapprochement === 'ignore' || t.statut_rapprochement === 'qualifie') ? (
                          <button onClick={() => restaurer(t)}
                            className="text-xs font-semibold text-blue-500 hover:underline cursor-pointer">
                            Restaurer
                          </button>
                        ) : (
                          <button onClick={() => ignorer(t)} title="Ignorer ce mouvement"
                            className="text-gray-300 hover:text-navy cursor-pointer">
                            <EyeOff size={15} />
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Qualification manuelle */}
      {qualifier && (
        <Modal
          title="Rapprocher ce mouvement"
          onClose={() => setQualifier(null)}
          width="max-w-2xl"
        >
          <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4">
            <div className="flex justify-between items-start gap-4">
              <div className="min-w-0">
                <p className="font-mono text-xs text-navy">{qualifier.remittance_information || '—'}</p>
                <p className="text-xs text-gray-400 mt-1">{fmtDate(qualifier.booking_date)}</p>
              </div>
              <p className="text-lg font-bold text-emerald-600 whitespace-nowrap">
                +{Number(qualifier.amount).toFixed(2)} €
              </p>
            </div>
          </div>

          {Number(qualifier.amount) > 0 && (
            <>
              <SuggestionsQualification
                mouvement={qualifier}
                libelleEcheance={libelleEcheance}
                onChoisir={(echId, motif) => rapprocherManuel(qualifier, echId, motif)}
              />
              <div className="flex items-center gap-3 my-5">
                <div className="h-px bg-gray-100 flex-1" />
                <span className="text-xs text-gray-300 uppercase tracking-wide">ou</span>
                <div className="h-px bg-gray-100 flex-1" />
              </div>
            </>
          )}

          <ClasserMouvement
            mouvement={qualifier}
            onClasser={(valeurs) => classer(qualifier, valeurs)}
          />
        </Modal>
      )}
    </div>
  )
}

// ── Classement par nature ───────────────────────────────────
// Pour tout ce qui ne solde pas une échéance de loyer : indemnité de
// résiliation, dépôt de garantie, apport en compte courant, travaux, taxe
// foncière. Le rattachement à un bien est facultatif — une écriture de
// société, frais bancaires ou apport, n'en concerne aucun.
function ClasserMouvement({ mouvement, onClasser }) {
  const { biens, baux, locataires } = useSociete()
  const options = categoriesPour(mouvement.amount)
  const [categorie, setCategorie] = useState(mouvement.categorie || '')
  const [bienId, setBienId] = useState(mouvement.bien_id || '')
  const [note, setNote] = useState(mouvement.note || '')
  const [envoi, setEnvoi] = useState(false)

  // Un crédit dont le montant avoisine le loyer TTC d'un bail est très
  // probablement un loyer — et un loyer se rapproche d'une échéance, même
  // avec un écart. C'est en classant des loyers « par nature » qu'ils
  // disparaissent du suivi des encaissements.
  const ressembleAUnLoyer = useMemo(() => {
    const recu = Number(mouvement.amount || 0)
    if (recu <= 0) return null
    for (const bail of baux.filter(b => b.actif)) {
      const ttc = (Number(bail.loyer_ht || 0) + Number(bail.charges || 0)) * coefTva(bail)
      if (ttc > 0 && Math.abs(recu - ttc) / ttc <= 0.2) {
        const loc = locataires.find(l => l.id === bail.locataire_id)
        return {
          nom: loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || 'un locataire',
          ttc,
        }
      }
    }
    return null
  }, [mouvement, baux, locataires])

  const valider = async () => {
    setEnvoi(true)
    await onClasser({ categorie, bien_id: bienId, note })
    setEnvoi(false)
  }

  return (
    <div>
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
        Classer par nature
      </h4>
      <p className="text-sm text-gray-400 mb-3">
        Le mouvement est enregistré avec sa nature, sans échéance en face.
      </p>

      {ressembleAUnLoyer && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-3">
          <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            Ce montant est proche du loyer de <strong>{ressembleAUnLoyer.nom}</strong>{' '}
            ({fmt(ressembleAUnLoyer.ttc)} TTC/mois). S'il s'agit d'un loyer,
            rapprochez-le de son échéance ci-dessus — l'écart éventuel se
            justifie à cette étape. Un loyer classé par nature disparaît du
            suivi des encaissements.
          </p>
        </div>
      )}

      <Sel label="Nature" value={categorie} onChange={e => setCategorie(e.target.value)}
        options={[{ v: '', l: 'Choisir...' }, ...options]} />

      <Sel label="Bien concerné (facultatif)" value={bienId} onChange={e => setBienId(e.target.value)}
        options={[
          { v: '', l: 'Aucun — écriture de société' },
          ...biens.map(b => ({ v: b.id, l: b.reference || `${b.adresse || ''} ${b.ville || ''}`.trim() || 'Bien' })),
        ]} />

      <Field label="Précision (facultatif)" value={note} onChange={e => setNote(e.target.value)}
        placeholder="Solde négocié au départ du locataire..." />

      <Btn onClick={valider} disabled={!categorie || envoi} className="justify-center w-full">
        <Tag size={15} />
        {envoi ? 'Enregistrement...' : 'Classer ce mouvement'}
      </Btn>
    </div>
  )
}

// Motifs d'écart entre le virement et l'échéance. Un écart expliqué cesse
// d'être signalé comme anomalie dans l'écran Écarts.
const MOTIFS_ECART = [
  'Régularisation de charges',
  'Rattrapage de charges',
  'Indexation du loyer',
  'Prorata temporis',
  'Paiement partiel',
  'Trop-perçu',
  'Loyer et charges réglés ensemble',
  'Autre',
]

// ── Suggestions + choix libre d'échéance ────────────────────
//
// Le choix porte sur TOUTES les échéances, y compris celles déjà soldées :
// une échéance cochée payée à la main est précisément celle qu'un virement
// vient confirmer. N'offrir que les échéances ouvertes rendait le
// rapprochement impossible dès lors que le suivi avait été tenu à la main.
function SuggestionsQualification({ mouvement, libelleEcheance, onChoisir }) {
  const { baux, transactions } = useSociete()
  const [tout, setTout] = useState(false)
  const [choix, setChoix] = useState(null)
  const [motif, setMotif] = useState('')
  const [precision, setPrecision] = useState('')

  const suggestions = Array.isArray(mouvement.suggestions) ? mouvement.suggestions : []
  const recu = Number(mouvement.amount || 0)

  // Montant dû en TTC : le virement est TTC, l'échéance est stockée en HT.
  const duTTC = (ech) => {
    const bail = baux.find(b => b.id === ech.bail_id)
    return (Number(ech.montant_loyer || 0) + Number(ech.montant_charges || 0)) * coefTva(bail)
  }

  const echeances = [...transactions].sort(
    (a, b) => (b.annee - a.annee) || (b.mois - a.mois),
  )

  const selectionner = (echId) => {
    const ech = transactions.find(t => t.id === echId)
    if (!ech) return
    const delta = recu - duTTC(ech)
    // Montant identique : rien à expliquer, on rapproche directement.
    if (Math.abs(delta) < 0.02) { onChoisir(echId, null); return }
    setChoix(ech)
    setMotif('')
    setPrecision('')
  }

  const confirmer = () => {
    const texte = [motif, precision.trim()].filter(Boolean).join(' — ')
    onChoisir(choix.id, texte || null)
  }

  // Confirmation d'un rapprochement dont le montant diffère.
  if (choix) {
    const du = duTTC(choix)
    const delta = recu - du
    return (
      <div>
        <button onClick={() => setChoix(null)}
          className="text-xs font-semibold text-gray-400 hover:text-navy cursor-pointer mb-3">
          ← Choisir une autre échéance
        </button>

        <p className="text-sm font-semibold text-navy mb-3">{libelleEcheance(choix.id)}</p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[11px] text-gray-400">Dû TTC</p>
            <p className="text-sm font-bold text-navy">{fmt(du)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[11px] text-gray-400">Reçu</p>
            <p className="text-sm font-bold text-navy">{fmt(recu)}</p>
          </div>
          <div className={`rounded-lg px-3 py-2 ${delta < 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
            <p className="text-[11px] text-gray-400">Écart</p>
            <p className={`text-sm font-bold ${delta < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {delta > 0 ? '+' : ''}{fmt(delta)}
            </p>
          </div>
        </div>

        <Sel label="Motif de l'écart" value={motif} onChange={e => setMotif(e.target.value)}
          options={[{ v: '', l: 'Choisir...' }, ...MOTIFS_ECART.map(m => ({ v: m, l: m }))]} />
        <Field label="Précision (facultatif)" value={precision}
          onChange={e => setPrecision(e.target.value)}
          placeholder="Régularisation 2025 sur les charges de copropriété" />

        <Btn onClick={confirmer} disabled={!motif} className="justify-center w-full">
          <Link2 size={15} />
          Rapprocher malgré l'écart
        </Btn>
      </div>
    )
  }

  return (
    <>
      {suggestions.length > 0 && (
        <>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
            Pistes proposées
          </h4>
          <div className="space-y-2 mb-4">
            {suggestions.map(s => (
              <button key={s.transaction_id}
                onClick={() => selectionner(s.transaction_id)}
                className="w-full flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer text-left transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy truncate">
                    {libelleEcheance(s.transaction_id)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{(s.raisons || []).join(' · ')}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-bold text-blue-500">
                    {Math.round(s.score * 100)} %
                  </span>
                  <Link2 size={14} className="text-blue-500" />
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {suggestions.length === 0 && (
        <p className="text-sm text-gray-400 mb-4">
          Aucune piste automatique. Choisissez l'échéance que ce virement règle —
          l'écart de montant, s'il y en a un, se justifie à l'étape suivante.
        </p>
      )}

      <button onClick={() => setTout(t => !t)}
        className="text-xs font-semibold text-blue-500 hover:underline cursor-pointer mb-2">
        {tout ? 'Masquer' : 'Choisir'} une échéance ({echeances.length})
      </button>

      {tout && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto mt-2">
          {echeances.length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              Aucune échéance enregistrée. Créez-les depuis l'échéancier.
            </p>
          ) : echeances.map(ech => {
            const du = duTTC(ech)
            const proche = Math.abs(recu - du) / (du || 1) <= 0.05
            return (
              <button key={ech.id}
                onClick={() => selectionner(ech.id)}
                className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-gray-50 hover:bg-gray-100 cursor-pointer text-left">
                <span className="text-sm text-navy truncate">
                  {libelleEcheance(ech.id)}
                  {ech.statut === 'payé' && (
                    <span className="ml-2 text-[10px] font-bold uppercase text-gray-300">déjà soldée</span>
                  )}
                </span>
                <span className={`text-xs font-semibold whitespace-nowrap ${proche ? 'text-emerald-600' : 'text-gray-500'}`}>
                  {fmt(du)} TTC
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
