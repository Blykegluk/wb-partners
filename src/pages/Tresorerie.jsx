import { useState, useMemo } from 'react'
import { Wallet } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useSociete } from '../contexts/Societe'
import { fmt, MONTHS_SHORT } from '../lib/utils'
import { PageHeader, Card, Sel } from '../components/UI'

export default function Tresorerie() {
  const { biens, baux, transactions } = useSociete()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const data = useMemo(() => {
    const activeBaux = baux.filter(b => b.actif)
    const activeBienIds = [...new Set(activeBaux.map(b => b.bien_id))]
    const activeBiens = biens.filter(b => activeBienIds.includes(b.id))

    // Monthly fixed costs from biens
    const annuitesTotal = activeBiens.reduce((s, b) => s + (b.annuites || 0), 0)
    const tfMensuel = activeBiens.reduce((s, b) => s + ((b.taxe_fonciere || 0) / 12), 0)
    const chargesTotal = activeBiens.reduce((s, b) => s + (b.charges || 0), 0)

    let cumulatif = 0
    return Array.from({ length: 12 }, (_, mois) => {
      // Income: paid transactions
      const paidTx = transactions.filter(t => t.annee === year && t.mois === mois && t.statut === 'payé')
      const entrees = paidTx.reduce((s, t) => s + (t.montant_loyer || 0) + (t.montant_charges || 0), 0)

      const sorties = annuitesTotal + tfMensuel + chargesTotal
      const solde = entrees - sorties
      cumulatif += solde

      return {
        mois: MONTHS_SHORT[mois],
        entrees: Math.round(entrees),
        annuites: Math.round(annuitesTotal),
        taxeFonciere: Math.round(tfMensuel),
        charges: Math.round(chargesTotal),
        sorties: Math.round(sorties),
        solde: Math.round(solde),
        cumulatif: Math.round(cumulatif),
      }
    })
  }, [biens, baux, transactions, year])

  const totalEntrees = data.reduce((s, d) => s + d.entrees, 0)
  const totalSorties = data.reduce((s, d) => s + d.sorties, 0)
  const soldeAnnuel = totalEntrees - totalSorties

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div>
      <PageHeader title="Trésorerie" sub={`Suivi cashflow ${year}`}>
        <Sel value={year} onChange={e => setYear(parseInt(e.target.value))} options={years.map(y => ({ v: y, l: y }))} />
      </PageHeader>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total entrées</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{fmt(totalEntrees)}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total sorties</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{fmt(totalSorties)}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Solde annuel</p>
          <p className={`text-2xl font-bold mt-1 ${soldeAnnuel >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(soldeAnnuel)}
          </p>
        </Card>
      </div>

      {/* Bar chart - Entrées vs Sorties */}
      <Card className="mb-6">
        <h3 className="text-sm font-bold text-navy mb-4">Entrées vs Sorties mensuelles</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Legend />
            <Bar dataKey="entrees" name="Loyers encaissés" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="annuites" name="Annuités" fill="#3b82f6" stackId="sorties" radius={[0, 0, 0, 0]} />
            <Bar dataKey="taxeFonciere" name="Taxe foncière" fill="#f59e0b" stackId="sorties" radius={[0, 0, 0, 0]} />
            <Bar dataKey="charges" name="Charges" fill="#94a3b8" stackId="sorties" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Line chart - Solde cumulé */}
      <Card>
        <h3 className="text-sm font-bold text-navy mb-4">Solde cumulé</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Line
              type="monotone"
              dataKey="cumulatif"
              name="Solde cumulé"
              stroke="#1a2d4e"
              strokeWidth={2.5}
              dot={{ fill: '#1a2d4e', r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
