import { useMemo } from 'react'
import { CalendarClock, TrendingUp, Landmark, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useSociete } from '../contexts/Societe'
import { fmt, MONTHS, MONTHS_SHORT } from '../lib/utils'
import { previsionnelMensuel } from '../lib/calculs'
import { PageHeader, Card, Kpi, KpiRow } from '../components/UI'

// Prévisionnel contractuel des 12 prochains mois : ce que les baux et les
// prêts prévoient — fins de franchise, fins de différé, taxe foncière —
// projeté sur le solde bancaire réel. Rien n'y est une promesse : c'est le
// scénario où chacun paie ce que son contrat stipule.
export default function Previsionnel({ navigate }) {
  const { biens, baux, bankAccounts, bankTransactions } = useSociete()

  const prev = useMemo(
    () => previsionnelMensuel({ biens, baux, bankAccounts, bankTransactions, horizon: 12 }),
    [biens, baux, bankAccounts, bankTransactions],
  )

  const totalLoyers = prev.mois.reduce((s, m) => s + m.loyers, 0)
  const totalSorties = prev.mois.reduce((s, m) => s + m.sorties, 0)
  const totalTva = prev.mois.reduce((s, m) => s + m.tvaCollectee, 0)
  const dernier = prev.mois[prev.mois.length - 1]

  const labelMois = (m) => `${MONTHS_SHORT[m.mois]} ${String(m.annee).slice(2)}`
  const data = prev.mois.map(m => ({
    mois: labelMois(m),
    loyers: Math.round(m.loyers),
    mensualites: Math.round(m.mensualites),
    taxeFonciere: Math.round(m.taxeFonciere),
    chargesExpl: Math.round(m.chargesExpl),
    solde: m.soldeProjete !== null ? Math.round(m.soldeProjete) : null,
  }))

  return (
    <div>
      <PageHeader title="Prévisionnel" sub="Les 12 prochains mois, tels que les contrats les prévoient" />

      <KpiRow cols={4}>
        <Kpi label="Loyers attendus (12 mois)" value={fmt(totalLoyers)} tone="positive"
          sub={`TTC, franchises et paliers appliqués — dont ${fmt(totalTva)} de TVA à reverser`} />
        <Kpi label="Sorties prévues (12 mois)" value={fmt(totalSorties)} tone="negative"
          sub="Mensualités de prêt, taxe foncière, charges des fiches" />
        <Kpi label="Net prévisionnel" value={fmt(totalLoyers - totalSorties)}
          tone={totalLoyers - totalSorties >= 0 ? 'positive' : 'negative'}
          sub="Avant TVA reversée, travaux et imprévus" />
        {prev.soldeDepart !== null ? (
          <Kpi label="Solde projeté à 12 mois" value={fmt(dernier.soldeProjete)} tone="brand"
            sub={`En partant du solde réel actuel (${fmt(prev.soldeDepart)})`} />
        ) : (
          <Kpi label="Solde projeté" value="—"
            sub="Connecter la banque pour projeter depuis le solde réel" />
        )}
      </KpiRow>

      {prev.pretsInconnus.length > 0 && (
        <Card className="p-4 mb-6 border-amber-200 bg-amber-50/40">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-navy">
              <strong>{prev.pretsInconnus.map(p => p.bien.reference || p.bien.adresse).join(', ')}</strong> :
              prêt sans taux ni mensualité renseignés — ses échéances ne figurent pas dans les
              sorties ci-dessous, le prévisionnel est donc optimiste d'autant. À compléter dans la
              fiche du bien (Patrimoine).
            </p>
          </div>
        </Card>
      )}

      {/* Événements à venir : les bascules que le prévisionnel contient */}
      {prev.evenements.length > 0 && (
        <Card className="p-5 mb-6">
          <h3 className="text-sm font-bold text-navy mb-3 flex items-center gap-2">
            <CalendarClock size={15} /> Échéances à venir
          </h3>
          <div className="space-y-2">
            {prev.evenements.map((e, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                  e.type === 'loyer' ? 'bg-emerald-500' : e.type === 'pret' ? 'bg-blue-500' : 'bg-amber-500'
                }`} />
                <div className="text-sm">
                  <span className="font-semibold text-navy">{MONTHS[e.quand.getMonth()]} {e.quand.getFullYear()}</span>
                  <span className="text-gray-600"> — {e.titre}</span>
                  <span className="text-gray-400 text-xs block">{e.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5 mb-6">
        <h3 className="text-sm font-bold text-navy mb-4 flex items-center gap-2">
          <TrendingUp size={15} /> Entrées et sorties prévues, mois par mois
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Legend />
            <Bar dataKey="loyers" name="Loyers attendus (TTC)" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="mensualites" name="Mensualités de prêt" stackId="out" fill="#3b82f6" radius={[0, 0, 0, 0]} />
            <Bar dataKey="taxeFonciere" name="Taxe foncière" stackId="out" fill="#f59e0b" radius={[0, 0, 0, 0]} />
            <Bar dataKey="chargesExpl" name="Charges (fiches biens)" stackId="out" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {prev.soldeDepart !== null && (
        <Card className="p-5 mb-6">
          <h3 className="text-sm font-bold text-navy mb-4 flex items-center gap-2">
            <Landmark size={15} /> Solde bancaire projeté
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} domain={['auto', 'auto']} />
              <Tooltip formatter={(v) => [fmt(v), 'Solde projeté']} />
              <Line type="monotone" dataKey="solde" name="Solde projeté (fin de mois)" stroke="#1a2d4e"
                strokeWidth={2.5} dot={{ fill: '#1a2d4e', r: 3.5 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-2">
            Projection contractuelle depuis le solde réel actuel : chacun paie ce que son bail ou son
            prêt stipule. La TVA collectée à reverser ({fmt(totalTva)} sur la période), les travaux et
            les imprévus n'y figurent pas.
          </p>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Mois</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Loyers TTC</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Mensualités prêt</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Taxe foncière</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Charges</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Net</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Solde projeté</th>
            </tr>
          </thead>
          <tbody>
            {prev.mois.map((m, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-4 py-2.5 text-sm font-semibold text-navy">{MONTHS[m.mois]} {m.annee}</td>
                <td className="px-4 py-2.5 text-sm text-right text-emerald-600 font-semibold">{m.loyers > 0 ? fmt(m.loyers) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2.5 text-sm text-right">{m.mensualites > 0 ? fmt(-m.mensualites) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2.5 text-sm text-right">{m.taxeFonciere > 0 ? fmt(-m.taxeFonciere) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2.5 text-sm text-right">{m.chargesExpl > 0 ? fmt(-m.chargesExpl) : <span className="text-gray-300">—</span>}</td>
                <td className={`px-4 py-2.5 text-sm text-right font-semibold ${m.net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(m.net)}</td>
                <td className="px-4 py-2.5 text-sm text-right font-semibold text-navy">{m.soldeProjete !== null ? fmt(m.soldeProjete) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
