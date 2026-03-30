import { useMemo, useState } from 'react'
import { useSociete } from '../contexts/Societe'
import { fmt, MONTHS, getLoyerPourMois } from '../lib/utils'
import { PageHeader, Card } from '../components/UI'

const TVA_RATE = 0.2

export default function TVA() {
  const { baux, biens, locataires, transactions } = useSociete()
  const [annee, setAnnee] = useState(new Date().getFullYear())

  const bauxActifs = baux.filter(b => b.actif)

  const data = useMemo(() => {
    return Array.from({ length: 12 }, (_, mois) => {
      // TVA collectée = TVA sur loyers encaissés ce mois
      const txMois = transactions.filter(t => t.annee === annee && t.mois === mois && t.statut === 'payé')
      const loyersHT = txMois.reduce((s, t) => s + (t.montant_loyer || 0), 0)
      const chargesHT = txMois.reduce((s, t) => s + (t.montant_charges || 0), 0)
      const tvaCollectee = (loyersHT + chargesHT) * TVA_RATE

      // TVA déductible = TVA sur charges de copropriété + annuités (pas de TVA sur annuités)
      // En pratique : TVA sur charges refacturables payées
      // Simplifié : on prend les charges des baux actifs / 12 comme proxy mensuel
      const chargesDeductiblesHT = bauxActifs.reduce((s, ba) => {
        const bien = biens.find(b => b.id === ba.bien_id)
        return s + (bien?.charges_refacturables || 0) / 12
      }, 0)
      const tvaDeductible = chargesDeductiblesHT * TVA_RATE

      // TVA sur investissements (frais de notaire, travaux, etc.) — simplifié
      const tvaInvestissements = 0

      const solde = tvaCollectee - tvaDeductible - tvaInvestissements

      return {
        mois, loyersHT, chargesHT,
        tvaCollectee, tvaDeductible, tvaInvestissements, solde,
      }
    })
  }, [annee, transactions, bauxActifs, biens])

  const totaux = data.reduce((acc, m) => ({
    loyersHT: acc.loyersHT + m.loyersHT,
    chargesHT: acc.chargesHT + m.chargesHT,
    tvaCollectee: acc.tvaCollectee + m.tvaCollectee,
    tvaDeductible: acc.tvaDeductible + m.tvaDeductible,
    solde: acc.solde + m.solde,
  }), { loyersHT: 0, chargesHT: 0, tvaCollectee: 0, tvaDeductible: 0, solde: 0 })

  return (
    <div>
      <PageHeader title="Balance TVA" sub="Suivi de la TVA collectée et déductible">
        <div className="flex items-center gap-2">
          <button onClick={() => setAnnee(a => a - 1)} className="px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer text-sm">←</button>
          <span className="font-bold text-navy">{annee}</span>
          <button onClick={() => setAnnee(a => a + 1)} className="px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer text-sm">→</button>
        </div>
      </PageHeader>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card className="p-4 text-center">
          <p className="text-xs text-gray-400 uppercase font-semibold">Loyers HT</p>
          <p className="text-xl font-bold text-navy mt-1">{fmt(totaux.loyersHT)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-emerald-600 uppercase font-semibold">TVA collectée</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{fmt(totaux.tvaCollectee)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-blue-600 uppercase font-semibold">TVA déductible</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{fmt(totaux.tvaDeductible)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs uppercase font-semibold" style={{ color: totaux.solde >= 0 ? '#dc2626' : '#22c55e' }}>
            {totaux.solde >= 0 ? 'TVA à reverser' : 'Crédit de TVA'}
          </p>
          <p className="text-xl font-bold mt-1" style={{ color: totaux.solde >= 0 ? '#dc2626' : '#22c55e' }}>
            {fmt(Math.abs(totaux.solde))}
          </p>
        </Card>
      </div>

      {/* Monthly table */}
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
        TVA à 20%. TVA collectée = 20% des loyers et charges encaissés. TVA déductible = 20% des charges refacturables de copropriété.
        Tous les montants dans l'application sont exprimés Hors Taxes.
      </p>
    </div>
  )
}
