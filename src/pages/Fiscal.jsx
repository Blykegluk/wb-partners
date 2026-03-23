import { useState } from 'react'
import { Receipt, Download } from 'lucide-react'
import { useSociete } from '../contexts/Societe'
import { fmt } from '../lib/utils'
import { PageHeader, Card, Sel, Btn, Empty } from '../components/UI'

const STORAGE_KEY = 'wb_fiscal_overrides'

const loadOverrides = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}

const saveOverrides = (o) => localStorage.setItem(STORAGE_KEY, JSON.stringify(o))

export default function Fiscal() {
  const { biens, baux, transactions, selected } = useSociete()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [overrides, setOverrides] = useState(loadOverrides)

  const getOverride = (bienId, key) => overrides[`${selected.id}_${bienId}_${year}_${key}`] || ''
  const setOverride = (bienId, key, val) => {
    const next = { ...overrides, [`${selected.id}_${bienId}_${year}_${key}`]: val }
    setOverrides(next)
    saveOverrides(next)
  }

  const rows = biens.map(bien => {
    const bienBaux = baux.filter(b => b.bien_id === bien.id && b.actif)
    const bailIds = bienBaux.map(b => b.id)
    const yearTx = transactions.filter(t => bailIds.includes(t.bail_id) && t.annee === year && t.statut === 'payé')

    const revenusBruts = yearTx.reduce((s, t) => s + (t.montant_loyer || 0), 0)
    const chargesRecuperees = yearTx.reduce((s, t) => s + (t.montant_charges || 0), 0)
    const annuites = (bien.annuites || 0) * 12
    const tf = bien.taxe_fonciere || 0
    const travaux = parseFloat(getOverride(bien.id, 'travaux')) || 0
    const assurance = parseFloat(getOverride(bien.id, 'assurance')) || 0
    const interets = parseFloat(getOverride(bien.id, 'interets')) || 0

    const chargesDeductibles = interets + tf + travaux + assurance
    const resultatNet = revenusBruts - chargesDeductibles

    return {
      bien,
      revenusBruts,
      chargesRecuperees,
      annuites,
      interets,
      tf,
      travaux,
      assurance,
      chargesDeductibles,
      resultatNet,
    }
  })

  const totals = rows.reduce((acc, r) => ({
    revenusBruts: acc.revenusBruts + r.revenusBruts,
    interets: acc.interets + r.interets,
    tf: acc.tf + r.tf,
    travaux: acc.travaux + r.travaux,
    assurance: acc.assurance + r.assurance,
    chargesDeductibles: acc.chargesDeductibles + r.chargesDeductibles,
    resultatNet: acc.resultatNet + r.resultatNet,
  }), { revenusBruts: 0, interets: 0, tf: 0, travaux: 0, assurance: 0, chargesDeductibles: 0, resultatNet: 0 })

  const exportCSV = () => {
    const header = ['Bien', 'Revenus bruts', 'Intérêts emprunt', 'Taxe foncière', 'Travaux', 'Assurance', 'Total charges', 'Résultat net']
    const lines = rows.map(r => [
      r.bien.reference || r.bien.adresse,
      r.revenusBruts, r.interets, r.tf, r.travaux, r.assurance, r.chargesDeductibles, r.resultatNet,
    ])
    lines.push(['TOTAL', totals.revenusBruts, totals.interets, totals.tf, totals.travaux, totals.assurance, totals.chargesDeductibles, totals.resultatNet])

    const csv = [header, ...lines].map(row => row.map(c => `"${c}"`).join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fiscal_${selected.nom}_${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div>
      <PageHeader title="Tableau de bord fiscal" sub={`Récapitulatif ${year}`}>
        <div className="flex gap-2 items-center">
          <Sel value={year} onChange={e => setYear(parseInt(e.target.value))} options={years.map(y => ({ v: y, l: y }))} />
          <Btn onClick={exportCSV}><Download size={14} className="mr-1" />Export CSV</Btn>
        </div>
      </PageHeader>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Revenus bruts</p>
          <p className="text-2xl font-bold text-navy mt-1">{fmt(totals.revenusBruts)}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Charges déductibles</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{fmt(totals.chargesDeductibles)}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Résultat net</p>
          <p className={`text-2xl font-bold mt-1 ${totals.resultatNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(totals.resultatNet)}
          </p>
        </Card>
      </div>

      {biens.length === 0 ? (
        <Empty icon={<Receipt size={40} />} text="Aucun bien enregistré." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Bien', 'Revenus bruts', 'Intérêts emprunt', 'Taxe foncière', 'Travaux', 'Assurance', 'Total charges', 'Résultat net'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.bien.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm font-semibold text-navy">{r.bien.reference || r.bien.adresse?.slice(0, 30)}</td>
                  <td className="px-4 py-3 text-sm">{fmt(r.revenusBruts)}</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-24 px-2 py-1 border rounded text-sm"
                      value={getOverride(r.bien.id, 'interets')}
                      onChange={e => setOverride(r.bien.id, 'interets', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm">{fmt(r.tf)}</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-24 px-2 py-1 border rounded text-sm"
                      value={getOverride(r.bien.id, 'travaux')}
                      onChange={e => setOverride(r.bien.id, 'travaux', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-24 px-2 py-1 border rounded text-sm"
                      value={getOverride(r.bien.id, 'assurance')}
                      onChange={e => setOverride(r.bien.id, 'assurance', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-red-500">{fmt(r.chargesDeductibles)}</td>
                  <td className={`px-4 py-3 text-sm font-bold ${r.resultatNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmt(r.resultatNet)}
                  </td>
                </tr>
              ))}
              {/* Total row */}
              <tr className="border-t-2 border-navy bg-gray-50">
                <td className="px-4 py-3 text-sm font-black text-navy">TOTAL</td>
                <td className="px-4 py-3 text-sm font-bold">{fmt(totals.revenusBruts)}</td>
                <td className="px-4 py-3 text-sm font-bold">{fmt(totals.interets)}</td>
                <td className="px-4 py-3 text-sm font-bold">{fmt(totals.tf)}</td>
                <td className="px-4 py-3 text-sm font-bold">{fmt(totals.travaux)}</td>
                <td className="px-4 py-3 text-sm font-bold">{fmt(totals.assurance)}</td>
                <td className="px-4 py-3 text-sm font-bold text-red-500">{fmt(totals.chargesDeductibles)}</td>
                <td className={`px-4 py-3 text-sm font-black ${totals.resultatNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmt(totals.resultatNet)}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Les intérêts d'emprunt, travaux et assurance sont à saisir manuellement. Ils sont sauvegardés localement.
      </p>
    </div>
  )
}
