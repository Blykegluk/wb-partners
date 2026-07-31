import { useMemo, useState } from 'react'
import { Landmark } from 'lucide-react'
import { useSociete } from '../contexts/Societe'
import { fmt, MONTHS, fmtDate } from '../lib/utils'
import { tvaReelle, coefTva } from '../lib/calculs'
import { PageHeader, Card, Kpi, KpiRow } from '../components/UI'

// Balance TVA sur flux réels : la TVA sur les loyers est due à
// l'encaissement — elle se lit donc virement par virement, au taux et à
// l'assujettissement du bail rapproché. La déductible est estimée par
// nature des débits qualifiés dans Banque (travaux et honoraires à 20 %
// dans le TTC) : la TVA exacte d'une facture ne figure pas dans un flux
// bancaire, et l'écran l'assume plutôt que d'afficher un proxy.
// L'ancienne version appliquait 20 % uniforme aux échéances déclarées et
// un forfait « charges refacturables / 12 » : elle ne subsiste qu'en repli
// quand aucune banque n'est connectée.
export default function TVA({ navigate }) {
  const { baux, biens, transactions, bankAccounts, bankTransactions } = useSociete()
  const [annee, setAnnee] = useState(new Date().getFullYear())

  const reel = useMemo(
    () => tvaReelle({ bankAccounts, bankTransactions, transactions, baux, annee }),
    [bankAccounts, bankTransactions, transactions, baux, annee],
  )

  const anneeCourante = new Date().getFullYear()
  const anneeMin = reel?.debut ? new Date(reel.debut).getFullYear() : anneeCourante - 4

  if (reel) {
    const totaux = reel.mois.reduce((acc, m) => ({
      encaisseTTC: acc.encaisseTTC + m.encaisseTTC,
      collectee: acc.collectee + m.collectee,
      deductible: acc.deductible + m.deductible,
      solde: acc.solde + m.solde,
    }), { encaisseTTC: 0, collectee: 0, deductible: 0, solde: 0 })

    return (
      <div>
        <PageHeader title="Balance TVA" sub={`TVA sur encaissements réels ${annee}`}>
          <div className="flex items-center gap-2">
            <button onClick={() => setAnnee(a => Math.max(anneeMin, a - 1))} disabled={annee <= anneeMin}
              className="px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer text-sm disabled:opacity-30 disabled:cursor-default">←</button>
            <span className="font-bold text-navy">{annee}</span>
            <button onClick={() => setAnnee(a => Math.min(anneeCourante, a + 1))} disabled={annee >= anneeCourante}
              className="px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer text-sm disabled:opacity-30 disabled:cursor-default">→</button>
          </div>
        </PageHeader>

        <KpiRow cols={4}>
          <Kpi label="Loyers encaissés TTC" value={fmt(totaux.encaisseTTC)} sub="Virements rapprochés d'une échéance" />
          <Kpi label="TVA collectée" value={fmt(totaux.collectee)} tone="positive" sub="Au taux réel de chaque bail" />
          <Kpi label="TVA déductible (est.)" value={fmt(totaux.deductible)} tone="brand" sub="Travaux et honoraires payés" />
          <Kpi
            label={totaux.solde >= 0 ? 'TVA à reverser' : 'Crédit de TVA'}
            value={fmt(Math.abs(totaux.solde))}
            tone={totaux.solde >= 0 ? 'negative' : 'positive'}
            sub="Solde de la période"
          />
        </KpiRow>

        {Math.abs(reel.ecartsRapprochement) > 0.02 && (
          <Card className="p-4 mb-6 border-amber-200 bg-amber-50/40">
            <p className="text-sm text-navy">
              <strong>{fmt(Math.abs(reel.ecartsRapprochement))} d'écart entre les virements
              rapprochés et le dû de leurs échéances</strong>
              {reel.ecartsRapprochement > 0 ? ' (trop-perçu)' : ' (moins-perçu)'} — la TVA
              affichée suit les montants réellement encaissés. Si un virement couvre autre
              chose qu'un loyer (indemnité, régularisation), rapprochez-le plus finement :
              sa TVA n'est peut-être pas au taux du bail.
            </p>
          </Card>
        )}
        {reel.declaresNonRapproches > 0 && (
          <Card className="p-4 mb-6 border-amber-200 bg-amber-50/40">
            <p className="text-sm text-navy">
              <strong>{reel.declaresNonRapproches} échéance{reel.declaresNonRapproches > 1 ? 's' : ''} déclarée{reel.declaresNonRapproches > 1 ? 's' : ''} payée{reel.declaresNonRapproches > 1 ? 's' : ''} sans virement rapproché</strong>{' '}
              (≈ {fmt(reel.tvaDeclareeNonComptee)} de TVA théorique non comptée ici). Rattachez les
              virements correspondants dans le{' '}
              <button onClick={() => navigate?.('flux', { tab: 'suivi' })}
                className="font-semibold text-blue-500 hover:underline cursor-pointer">Suivi des loyers</button>{' '}
              pour une balance complète.
            </p>
          </Card>
        )}

        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Mois</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Loyers encaissés TTC</th>
                <th className="px-4 py-3 text-xs font-bold text-emerald-600 uppercase tracking-wide text-right">TVA collectée</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Travaux & honoraires TTC</th>
                <th className="px-4 py-3 text-xs font-bold text-blue-600 uppercase tracking-wide text-right">TVA déductible (est.)</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Solde TVA</th>
              </tr>
            </thead>
            <tbody>
              {reel.mois.map(m => (
                <tr key={m.mois} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm font-medium text-navy">{MONTHS[m.mois]}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmt(m.encaisseTTC)}</td>
                  <td className="px-4 py-3 text-sm text-right text-emerald-600 font-semibold">{fmt(m.collectee)}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmt(m.baseDeductible)}</td>
                  <td className="px-4 py-3 text-sm text-right text-blue-600 font-semibold">{fmt(m.deductible)}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: m.solde >= 0 ? '#dc2626' : '#22c55e' }}>
                    {m.solde >= 0 ? '' : '-'}{fmt(Math.abs(m.solde))}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-navy bg-gray-50 font-bold">
                <td className="px-4 py-3 text-sm text-navy">TOTAL {annee}</td>
                <td className="px-4 py-3 text-sm text-right text-navy">{fmt(totaux.encaisseTTC)}</td>
                <td className="px-4 py-3 text-sm text-right text-emerald-600">{fmt(totaux.collectee)}</td>
                <td className="px-4 py-3 text-sm text-right text-navy">{fmt(reel.mois.reduce((s, m) => s + m.baseDeductible, 0))}</td>
                <td className="px-4 py-3 text-sm text-right text-blue-600">{fmt(totaux.deductible)}</td>
                <td className="px-4 py-3 text-sm text-right" style={{ color: totaux.solde >= 0 ? '#dc2626' : '#22c55e' }}>
                  {totaux.solde >= 0 ? '' : '-'}{fmt(Math.abs(totaux.solde))}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        <p className="text-xs text-gray-300 mt-4">
          Collectée : calculée virement par virement au taux et à l'assujettissement du bail
          (fait générateur : l'encaissement). Déductible : estimation par nature — travaux et
          honoraires à 20 % dans le TTC ; assurance et frais bancaires exonérés, taxes et
          échéances de prêt hors champ, TVA de copropriété non estimable depuis un flux
          bancaire. Données depuis le {fmtDate(reel.debut)} (début de l'historique bancaire).
          Balance indicative — la déclaration se fait sur les factures.
        </p>
      </div>
    )
  }

  // ── Repli déclaratif (aucune banque connectée) ───────────────
  return <TvaDeclarative baux={baux} biens={biens} transactions={transactions}
    annee={annee} setAnnee={setAnnee} navigate={navigate} />
}

function TvaDeclarative({ baux, biens, transactions, annee, setAnnee, navigate }) {
  const bauxActifs = baux.filter(b => b.actif)
  const bailParId = useMemo(() => new Map(baux.map(b => [b.id, b])), [baux])

  const data = useMemo(() => {
    return Array.from({ length: 12 }, (_, mois) => {
      // TVA au taux réel de chaque bail (l'ancien écran appliquait 20 % à
      // tous, y compris non assujettis).
      const txMois = transactions.filter(t => t.annee === annee && t.mois === mois && t.statut === 'payé')
      let loyersHT = 0, chargesHT = 0, tvaCollectee = 0
      for (const t of txMois) {
        const coef = coefTva(bailParId.get(t.bail_id))
        loyersHT += (t.montant_loyer || 0)
        chargesHT += (t.montant_charges || 0)
        tvaCollectee += ((t.montant_loyer || 0) + (t.montant_charges || 0)) * (coef - 1)
      }

      const chargesDeductiblesHT = bauxActifs.reduce((s, ba) => {
        const bien = biens.find(b => b.id === ba.bien_id)
        return s + (bien?.charges_refacturables || 0) / 12
      }, 0)
      const tvaDeductible = chargesDeductiblesHT * 0.2

      const solde = tvaCollectee - tvaDeductible
      return { mois, loyersHT, chargesHT, tvaCollectee, tvaDeductible, solde }
    })
  }, [annee, transactions, bauxActifs, biens, bailParId])

  const totaux = data.reduce((acc, m) => ({
    loyersHT: acc.loyersHT + m.loyersHT,
    chargesHT: acc.chargesHT + m.chargesHT,
    tvaCollectee: acc.tvaCollectee + m.tvaCollectee,
    tvaDeductible: acc.tvaDeductible + m.tvaDeductible,
    solde: acc.solde + m.solde,
  }), { loyersHT: 0, chargesHT: 0, tvaCollectee: 0, tvaDeductible: 0, solde: 0 })

  return (
    <div>
      <PageHeader title="Balance TVA" sub={`Estimation déclarative ${annee}`}>
        <div className="flex items-center gap-2">
          <button onClick={() => setAnnee(a => a - 1)} className="px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer text-sm">←</button>
          <span className="font-bold text-navy">{annee}</span>
          <button onClick={() => setAnnee(a => a + 1)} className="px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer text-sm">→</button>
        </div>
      </PageHeader>

      <Card className="p-4 mb-6 border-amber-200 bg-amber-50/40">
        <div className="flex items-start gap-3">
          <Landmark size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-navy">
            <strong>Aucun compte bancaire connecté</strong> — cette balance repose sur les
            échéances déclarées payées, pas sur les encaissements réels.{' '}
            <button onClick={() => navigate?.('parametres', { tab: 'banque' })}
              className="font-semibold text-blue-500 hover:underline cursor-pointer">
              Connecter la banque
            </button>{' '}
            pour une TVA calculée sur les virements.
          </p>
        </div>
      </Card>

      <KpiRow cols={4}>
        <Kpi label="Loyers HT" value={fmt(totaux.loyersHT)} sub="Échéances déclarées payées" />
        <Kpi label="TVA collectée" value={fmt(totaux.tvaCollectee)} tone="positive" sub="Au taux de chaque bail" />
        <Kpi label="TVA déductible" value={fmt(totaux.tvaDeductible)} tone="brand" sub="Forfait charges refacturables" />
        <Kpi
          label={totaux.solde >= 0 ? 'TVA à reverser' : 'Crédit de TVA'}
          value={fmt(Math.abs(totaux.solde))}
          tone={totaux.solde >= 0 ? 'negative' : 'positive'}
          sub="Solde de la période"
        />
      </KpiRow>

      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Mois</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Loyers HT</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Charges HT</th>
              <th className="px-4 py-3 text-xs font-bold text-emerald-600 uppercase tracking-wide text-right">TVA collectée</th>
              <th className="px-4 py-3 text-xs font-bold text-blue-600 uppercase tracking-wide text-right">TVA déductible</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Solde TVA</th>
            </tr>
          </thead>
          <tbody>
            {data.map(m => (
              <tr key={m.mois} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3 text-sm font-medium text-navy">{MONTHS[m.mois]}</td>
                <td className="px-4 py-3 text-sm text-right">{fmt(m.loyersHT)}</td>
                <td className="px-4 py-3 text-sm text-right">{fmt(m.chargesHT)}</td>
                <td className="px-4 py-3 text-sm text-right text-emerald-600 font-semibold">{fmt(m.tvaCollectee)}</td>
                <td className="px-4 py-3 text-sm text-right text-blue-600 font-semibold">{fmt(m.tvaDeductible)}</td>
                <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: m.solde >= 0 ? '#dc2626' : '#22c55e' }}>
                  {m.solde >= 0 ? '' : '-'}{fmt(Math.abs(m.solde))}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-navy bg-gray-50 font-bold">
              <td className="px-4 py-3 text-sm text-navy">TOTAL {annee}</td>
              <td className="px-4 py-3 text-sm text-right text-navy">{fmt(totaux.loyersHT)}</td>
              <td className="px-4 py-3 text-sm text-right text-navy">{fmt(totaux.chargesHT)}</td>
              <td className="px-4 py-3 text-sm text-right text-emerald-600">{fmt(totaux.tvaCollectee)}</td>
              <td className="px-4 py-3 text-sm text-right text-blue-600">{fmt(totaux.tvaDeductible)}</td>
              <td className="px-4 py-3 text-sm text-right" style={{ color: totaux.solde >= 0 ? '#dc2626' : '#22c55e' }}>
                {totaux.solde >= 0 ? '' : '-'}{fmt(Math.abs(totaux.solde))}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-gray-300 mt-4">
        Estimation : TVA collectée au taux de chaque bail sur les échéances déclarées payées ;
        TVA déductible forfaitaire sur les charges refacturables. Connectez la banque pour une
        balance sur flux réels.
      </p>
    </div>
  )
}
