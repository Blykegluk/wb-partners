import { useMemo, useState, useEffect } from 'react'
import { Landmark, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { fmt, fmtDate } from '../lib/utils'
import { coefTva, interetsAnnee, estAcquis, tresorerieReelle } from '../lib/calculs'
import { PageHeader, Card, Kpi, KpiRow } from '../components/UI'

// Récapitulatif fiscal sur flux réels. L'ancienne version additionnait des
// échéances déclarées, la taxe foncière ACTUELLE des fiches biens quelle que
// soit l'année affichée, et trois colonnes stockées dans le navigateur
// (localStorage) — perdues au changement de poste, invisibles des associés.
//
// Ici : produits = loyers réellement encaissés (HT, au taux du bail),
// charges = débits bancaires qualifiés dans Banque, intérêts d'emprunt =
// calculés depuis le tableau d'amortissement de chaque prêt, saisies
// complémentaires en base (fiscal_saisies), partagées et datées. Le résultat
// reste une base INDICATIVE : la liasse du comptable fait foi.

// Postes de charges décaissées, par nature bancaire. Les échéances de prêt
// n'y figurent pas : seule leur part d'intérêts est déductible, elle est
// calculée à part. Les mouvements de capital (dividendes, CCA, dépôts) non
// plus : ce ne sont pas des charges.
const POSTES_CHARGES = [
  { k: 'impots', l: 'Impôts et taxes (TF, CFE…)', cats: ['taxe_fonciere', 'taxe_bureaux', 'impots_taxes'], note: null },
  { k: 'copro', l: 'Charges de copropriété', cats: ['charges_copropriete'], note: null },
  { k: 'assurance', l: 'Assurance', cats: ['assurance'], note: null },
  { k: 'honoraires', l: 'Honoraires (gestion, comptable…)', cats: ['honoraires'], note: null },
  { k: 'frais_bancaires', l: 'Frais bancaires', cats: ['frais_bancaires'], note: null },
  { k: 'travaux', l: 'Travaux', cats: ['travaux'], note: 'déductibles ou amortissables selon leur nature — à arbitrer avec le comptable' },
  { k: 'divers', l: 'Charges diverses', cats: ['charges_diverses', 'autre_depense'], note: null },
]

const CLES_SAISIES = [
  { cle: 'charges_complementaires', l: 'Autres charges déductibles (saisie)', aide: 'Charges réglées hors des comptes suivis (ex. compte non connecté)' },
  { cle: 'reintegrations', l: 'Réintégrations (saisie)', aide: 'Charges non déductibles à réintégrer (ex. quote-part de travaux immobilisés)' },
]

export default function Fiscal({ navigate }) {
  const { baux, biens, transactions, bankAccounts, bankTransactions, selected, canEdit } = useSociete()
  const anneeCourante = new Date().getFullYear()
  const [annee, setAnnee] = useState(anneeCourante)
  const [saisies, setSaisies] = useState({})
  const [brouillon, setBrouillon] = useState({})

  const reel = useMemo(
    () => tresorerieReelle({ bankAccounts, bankTransactions }),
    [bankAccounts, bankTransactions],
  )
  const anneeMin = reel?.debut ? new Date(reel.debut).getFullYear() : anneeCourante - 4

  // Saisies complémentaires : en base, par société et par année.
  useEffect(() => {
    if (!selected?.id) return
    let vivant = true
    supabase.from('fiscal_saisies').select('cle, valeur')
      .eq('societe_id', selected.id).eq('annee', annee)
      .then(({ data }) => {
        if (!vivant) return
        const v = Object.fromEntries((data || []).map(r => [r.cle, Number(r.valeur)]))
        setSaisies(v)
        setBrouillon(Object.fromEntries(CLES_SAISIES.map(c => [c.cle, v[c.cle] ?? ''])))
      })
    return () => { vivant = false }
  }, [selected?.id, annee])

  const enregistrerSaisie = async (cle) => {
    const valeur = Number(brouillon[cle] || 0)
    await supabase.from('fiscal_saisies').upsert({
      societe_id: selected.id, annee, cle, valeur, maj_le: new Date().toISOString(),
    })
    setSaisies(s => ({ ...s, [cle]: valeur }))
  }

  const data = useMemo(() => {
    const bailParId = new Map(baux.map(b => [b.id, b]))
    const duAnnee = (t) => t.booking_date && new Date(t.booking_date).getFullYear() === annee

    // ── Produits : loyers réellement encaissés, ramenés en HT au taux du bail ──
    let loyersHT = 0
    let loyersTTC = 0
    if (reel) {
      for (const t of reel.mvts.filter(duAnnee)) {
        if (!(Number(t.amount) > 0 && t.transaction_id && t.statut_rapprochement?.startsWith('rapproche'))) continue
        const ech = transactions.find(x => x.id === t.transaction_id)
        const coef = coefTva(bailParId.get(ech?.bail_id))
        loyersTTC += Number(t.amount)
        loyersHT += Number(t.amount) / coef
      }
    } else {
      // Repli déclaratif : échéances marquées payées (déjà en HT).
      for (const t of transactions.filter(t => t.annee === annee && t.statut === 'payé')) {
        loyersHT += (Number(t.montant_loyer) || 0) + (Number(t.montant_charges) || 0)
      }
    }

    // Recettes hors loyers (indemnités, refacturations…) : informatives,
    // leur traitement fiscal dépend de leur nature.
    const autresRecettes = reel
      ? reel.mvts.filter(t => duAnnee(t) && Number(t.amount) > 0
          && !(t.transaction_id && t.statut_rapprochement?.startsWith('rapproche')))
          .reduce((s, t) => s + Number(t.amount), 0)
      : 0

    // ── Charges décaissées, par nature qualifiée dans Banque ──
    const charges = Object.fromEntries(POSTES_CHARGES.map(p => [p.k, 0]))
    let aQualifier = 0
    if (reel) {
      for (const t of reel.mvts.filter(duAnnee)) {
        if (Number(t.amount) >= 0) continue
        const poste = POSTES_CHARGES.find(p => p.cats.includes(t.categorie))
        if (poste) charges[poste.k] += -Number(t.amount)
        else if (t.statut_rapprochement === 'a_qualifier') aQualifier += -Number(t.amount)
      }
    }
    const totalCharges = Object.values(charges).reduce((s, v) => s + v, 0)

    // ── Intérêts d'emprunt : tableau d'amortissement de chaque prêt ──
    const interets = biens.filter(b => estAcquis(b)).reduce((s, b) => s + interetsAnnee(b, annee), 0)
    const pretsSansTaux = biens.filter(b =>
      estAcquis(b) && Number(b.montant_emprunt) > 0 && (!b.taux_interet || !b.duree_credit))

    const chargesComp = saisies.charges_complementaires || 0
    const reintegrations = saisies.reintegrations || 0
    const resultat = loyersHT - totalCharges - interets - chargesComp + reintegrations

    return { loyersHT, loyersTTC, autresRecettes, charges, totalCharges, aQualifier, interets, pretsSansTaux, resultat }
  }, [reel, transactions, baux, biens, annee, saisies])

  const exportCsv = () => {
    const lignes = [
      ['Poste', 'Montant'],
      ['Loyers encaissés HT', data.loyersHT.toFixed(2)],
      ...POSTES_CHARGES.map(p => [p.l, (-data.charges[p.k]).toFixed(2)]),
      ["Intérêts d'emprunt (calculés)", (-data.interets).toFixed(2)],
      ...CLES_SAISIES.map(c => [c.l, ((c.cle === 'reintegrations' ? 1 : -1) * (saisies[c.cle] || 0)).toFixed(2)]),
      ['Résultat estimé', data.resultat.toFixed(2)],
    ]
    const csv = lignes.map(l => l.join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `fiscal-${selected?.nom || 'societe'}-${annee}.csv`
    a.click()
  }

  return (
    <div>
      <PageHeader title="Fiscal" sub={`Base indicative ${annee} — la liasse du comptable fait foi`}>
        <div className="flex items-center gap-2">
          <button onClick={() => setAnnee(a => Math.max(anneeMin, a - 1))} disabled={annee <= anneeMin}
            className="px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer text-sm disabled:opacity-30 disabled:cursor-default">←</button>
          <span className="font-bold text-navy">{annee}</span>
          <button onClick={() => setAnnee(a => Math.min(anneeCourante, a + 1))} disabled={annee >= anneeCourante}
            className="px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer text-sm disabled:opacity-30 disabled:cursor-default">→</button>
          <button onClick={exportCsv} title="Exporter en CSV"
            className="ml-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 cursor-pointer inline-flex items-center gap-1.5">
            <Download size={14} /> CSV
          </button>
        </div>
      </PageHeader>

      {!reel && (
        <Card className="p-4 mb-6 border-amber-200 bg-amber-50/40">
          <div className="flex items-start gap-3">
            <Landmark size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-navy">
              <strong>Aucun compte bancaire connecté</strong> — les produits reposent sur le
              déclaratif et aucune charge réelle n'est disponible.{' '}
              <button onClick={() => navigate?.('parametres', { tab: 'banque' })}
                className="font-semibold text-blue-500 hover:underline cursor-pointer">Connecter la banque</button>
            </p>
          </div>
        </Card>
      )}

      <KpiRow cols={4}>
        <Kpi label="Loyers encaissés (HT)" value={fmt(data.loyersHT)} tone="positive"
          sub={reel ? `${fmt(data.loyersTTC)} TTC en banque` : 'Échéances déclarées payées'} />
        <Kpi label="Charges décaissées" value={fmt(data.totalCharges)} tone="negative"
          sub="Débits qualifiés dans Banque" />
        <Kpi label="Intérêts d'emprunt" value={fmt(data.interets)} tone="brand"
          sub="Calculés sur les tableaux d'amortissement" />
        <Kpi label={data.resultat >= 0 ? 'Résultat estimé' : 'Déficit estimé'}
          value={fmt(Math.abs(data.resultat))}
          tone={data.resultat >= 0 ? 'positive' : 'negative'}
          sub="Avant amortissements et IS" />
      </KpiRow>

      {(data.aQualifier > 0 || data.pretsSansTaux.length > 0 || data.autresRecettes > 0) && (
        <Card className="p-4 mb-6 border-amber-200 bg-amber-50/40">
          <ul className="text-sm text-navy space-y-1">
            {data.aQualifier > 0 && (
              <li><strong>{fmt(data.aQualifier)} de débits non qualifiés</strong> n'entrent dans aucun
                poste — qualifiez-les dans{' '}
                <button onClick={() => navigate?.('flux', { tab: 'banque' })}
                  className="font-semibold text-blue-500 hover:underline cursor-pointer">Banque</button>.</li>
            )}
            {data.pretsSansTaux.length > 0 && (
              <li><strong>{data.pretsSansTaux.map(b => b.reference || b.ville).join(', ')}</strong> :
                prêt sans taux ou durée renseignés — ses intérêts ne sont pas comptés. À compléter
                dans la fiche du bien.</li>
            )}
            {data.autresRecettes > 0 && (
              <li>{fmt(data.autresRecettes)} de recettes hors loyers (indemnités, refacturations…) —
                traitement fiscal selon leur nature, non intégrées au résultat ci-dessus.</li>
            )}
          </ul>
        </Card>
      )}

      <Card className="overflow-x-auto mb-6">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Poste</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Montant</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Source</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50 bg-emerald-50/30">
              <td className="px-4 py-3 text-sm font-semibold text-navy">Loyers encaissés (HT)</td>
              <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-600">{fmt(data.loyersHT)}</td>
              <td className="px-4 py-3 text-xs text-gray-400">{reel ? 'Virements rapprochés, HT au taux du bail' : 'Déclaratif'}</td>
            </tr>
            {POSTES_CHARGES.map(p => (
              <tr key={p.k} className="border-t border-gray-50">
                <td className="px-4 py-3 text-sm text-navy">{p.l}
                  {p.note && <span className="block text-[11px] text-gray-400">{p.note}</span>}</td>
                <td className="px-4 py-3 text-sm text-right">{data.charges[p.k] > 0 ? `- ${fmt(data.charges[p.k])}` : '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-400">Banque (qualifié)</td>
              </tr>
            ))}
            <tr className="border-t border-gray-50">
              <td className="px-4 py-3 text-sm text-navy">Intérêts d'emprunt</td>
              <td className="px-4 py-3 text-sm text-right">{data.interets > 0 ? `- ${fmt(data.interets)}` : '—'}</td>
              <td className="px-4 py-3 text-xs text-gray-400">Amortissement calculé (part capital exclue)</td>
            </tr>
            {CLES_SAISIES.map(c => (
              <tr key={c.cle} className="border-t border-gray-50">
                <td className="px-4 py-3 text-sm text-navy">{c.l}
                  <span className="block text-[11px] text-gray-400">{c.aide}</span></td>
                <td className="px-4 py-3 text-right">
                  {canEdit ? (
                    <input type="number" value={brouillon[c.cle] ?? ''} placeholder="0"
                      onChange={e => setBrouillon(b => ({ ...b, [c.cle]: e.target.value }))}
                      onBlur={() => enregistrerSaisie(c.cle)}
                      className="w-32 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right outline-none focus:border-blue-500" />
                  ) : (
                    <span className="text-sm">{fmt(saisies[c.cle] || 0)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">Saisie (enregistrée pour toute la société)</td>
              </tr>
            ))}
            <tr className="border-t-2 border-navy bg-gray-50 font-bold">
              <td className="px-4 py-3 text-sm text-navy">{data.resultat >= 0 ? 'Résultat estimé' : 'Déficit estimé'}</td>
              <td className="px-4 py-3 text-sm text-right" style={{ color: data.resultat >= 0 ? '#22c55e' : '#dc2626' }}>
                {fmt(data.resultat)}
              </td>
              <td className="px-4 py-3 text-xs text-gray-400">Avant amortissements et IS</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-gray-300">
        Base indicative construite sur les encaissements et décaissements constatés
        {reel?.debut ? ` (historique bancaire depuis le ${fmtDate(reel.debut)})` : ''} : elle ne
        remplace ni les amortissements comptables, ni les retraitements du comptable. Les
        saisies complémentaires sont enregistrées en base, par société et par année.
      </p>
    </div>
  )
}
