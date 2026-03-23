import { useState, useMemo } from 'react'
import { Calculator, Trash2, Copy } from 'lucide-react'
import { fmt, fmtPct } from '../lib/utils'
import { PageHeader, Card, Field, Grid2, Grid3, Btn, Empty } from '../components/UI'

const EMPTY = { nom: '', prix: '', apport: '', taux: '', duree: '', loyer: '', charges: '', taxeFonciere: '' }
const STORAGE_KEY = 'wb_simulateur_scenarios'

const loadScenarios = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

export default function Simulateur() {
  const [form, setForm] = useState({ ...EMPTY })
  const [scenarios, setScenarios] = useState(loadScenarios)
  const [tab, setTab] = useState('calc') // 'calc' | 'compare'

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const n = (k) => parseFloat(form[k]) || 0

  const results = useMemo(() => {
    const prix = n('prix'), apport = n('apport'), taux = n('taux') / 100
    const duree = n('duree'), loyer = n('loyer'), charges = n('charges'), tf = n('taxeFonciere')

    if (!prix) return null

    const emprunt = prix - apport
    const tauxM = taux / 12
    const mensualite = emprunt > 0 && taux > 0 && duree > 0
      ? emprunt * tauxM / (1 - Math.pow(1 + tauxM, -duree))
      : 0
    const cashflow = loyer - mensualite - charges - tf / 12
    const rendementBrut = prix > 0 ? (loyer * 12) / prix : 0
    const rendementNet = apport > 0 ? (cashflow * 12) / apport : 0
    const pointMort = cashflow > 0 ? apport / (cashflow * 12) : null

    return { emprunt, mensualite, cashflow, rendementBrut, rendementNet, pointMort }
  }, [form])

  const save = () => {
    if (!form.nom.trim() || !results) return
    const entry = { ...form, id: Date.now(), results: { ...results } }
    const next = [...scenarios, entry]
    setScenarios(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setForm({ ...EMPTY })
  }

  const remove = (id) => {
    const next = scenarios.filter(s => s.id !== id)
    setScenarios(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const duplicate = (s) => {
    setForm({ ...s, nom: s.nom + ' (copie)' })
    setTab('calc')
  }

  return (
    <div>
      <PageHeader title="Simulateur d'acquisition" sub="Évaluez la rentabilité avant d'acheter">
        <div className="flex gap-2">
          <Btn variant={tab === 'calc' ? 'primary' : 'ghost'} onClick={() => setTab('calc')}>Calculer</Btn>
          <Btn variant={tab === 'compare' ? 'primary' : 'ghost'} onClick={() => setTab('compare')}>
            Comparer ({scenarios.length})
          </Btn>
        </div>
      </PageHeader>

      {tab === 'calc' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <Card>
            <h3 className="text-sm font-bold text-navy mb-4">Paramètres</h3>
            <Field label="Nom du scénario" value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="ex: Local Rue de la Paix" />
            <Grid2>
              <Field label="Prix d'achat (€)" type="number" value={form.prix} onChange={e => set('prix', e.target.value)} />
              <Field label="Apport (€)" type="number" value={form.apport} onChange={e => set('apport', e.target.value)} />
            </Grid2>
            <Grid3>
              <Field label="Taux (%)" type="number" value={form.taux} onChange={e => set('taux', e.target.value)} step="0.01" />
              <Field label="Durée (mois)" type="number" value={form.duree} onChange={e => set('duree', e.target.value)} />
              <Field label="Loyer mensuel (€)" type="number" value={form.loyer} onChange={e => set('loyer', e.target.value)} />
            </Grid3>
            <Grid2>
              <Field label="Charges mensuelles (€)" type="number" value={form.charges} onChange={e => set('charges', e.target.value)} />
              <Field label="Taxe foncière annuelle (€)" type="number" value={form.taxeFonciere} onChange={e => set('taxeFonciere', e.target.value)} />
            </Grid2>
            <div className="flex gap-2 mt-4">
              <Btn onClick={save} disabled={!form.nom.trim() || !results}>Sauvegarder</Btn>
              <Btn variant="ghost" onClick={() => setForm({ ...EMPTY })}>Réinitialiser</Btn>
            </div>
          </Card>

          {/* Results */}
          <div className="space-y-4">
            {results ? (
              <>
                <ResultCard label="Emprunt" value={fmt(results.emprunt)} />
                <ResultCard label="Mensualité crédit" value={fmt(results.mensualite)} />
                <ResultCard
                  label="Cashflow mensuel"
                  value={fmt(results.cashflow)}
                  color={results.cashflow >= 0 ? 'text-green-600' : 'text-red-600'}
                />
                <ResultCard label="Rendement brut" value={fmtPct(results.rendementBrut)} />
                <ResultCard
                  label="Rendement net / apport"
                  value={fmtPct(results.rendementNet)}
                  color={results.rendementNet >= 0.05 ? 'text-green-600' : results.rendementNet >= 0 ? 'text-yellow-600' : 'text-red-600'}
                />
                {results.pointMort !== null && (
                  <ResultCard label="Point mort" value={`${results.pointMort.toFixed(1)} ans`} />
                )}
              </>
            ) : (
              <Card className="text-center py-12 text-gray-400">
                <Calculator size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Renseignez les paramètres pour voir les résultats</p>
              </Card>
            )}
          </div>
        </div>
      ) : (
        /* Compare tab */
        scenarios.length === 0 ? (
          <Empty icon={<Calculator size={40} />} text="Aucun scénario sauvegardé." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Scénario', 'Prix', 'Apport', 'Mensualité', 'Cashflow', 'Rdt brut', 'Rdt net', 'Point mort', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <tr key={s.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm font-semibold text-navy">{s.nom}</td>
                    <td className="px-4 py-3 text-sm">{fmt(s.prix)}</td>
                    <td className="px-4 py-3 text-sm">{fmt(s.apport)}</td>
                    <td className="px-4 py-3 text-sm">{fmt(s.results.mensualite)}</td>
                    <td className={`px-4 py-3 text-sm font-semibold ${s.results.cashflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(s.results.cashflow)}
                    </td>
                    <td className="px-4 py-3 text-sm">{fmtPct(s.results.rendementBrut)}</td>
                    <td className="px-4 py-3 text-sm">{fmtPct(s.results.rendementNet)}</td>
                    <td className="px-4 py-3 text-sm">{s.results.pointMort ? `${s.results.pointMort.toFixed(1)} ans` : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => duplicate(s)} className="text-gray-400 hover:text-navy cursor-pointer"><Copy size={14} /></button>
                        <button onClick={() => remove(s.id)} className="text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}
    </div>
  )
}

function ResultCard({ label, value, color = 'text-navy' }) {
  return (
    <Card className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
    </Card>
  )
}
