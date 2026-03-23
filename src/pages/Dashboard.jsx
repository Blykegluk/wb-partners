import { useMemo } from 'react'
import { Building2, Users, FileText, Euro, TrendingUp, AlertTriangle, Download } from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useSociete } from '../contexts/Societe'
import { fmt, fmtPct, MONTHS, MONTHS_SHORT, getLoyerActuel } from '../lib/utils'
import { rendementBrut } from '../lib/calculs'
import { pdfPortfolio } from '../lib/pdf'
import { Badge, Card, Btn } from '../components/UI'

export default function Dashboard() {
  const { biens, locataires, baux, transactions, selected } = useSociete()

  const bauxActifs = baux.filter(b => b.actif)
  const totalEnc = transactions.filter(t => t.statut === 'payé').reduce((s, t) => s + t.montant_loyer + t.montant_charges, 0)
  const totalImp = transactions.filter(t => t.statut === 'impayé').reduce((s, t) => s + t.montant_loyer + t.montant_charges, 0)
  const tauxOcc = biens.length ? Math.round(bauxActifs.length / biens.length * 100) : 0
  const alertes = transactions.filter(t => t.statut === 'impayé')

  const tod = new Date()
  const alertesRevision = baux.filter(b => {
    if (!b.date_revision_anniversaire) return false
    const rev = new Date(b.date_revision_anniversaire)
    const rty = new Date(tod.getFullYear(), rev.getMonth(), rev.getDate())
    if (rty < tod) rty.setFullYear(tod.getFullYear() + 1)
    return (rty - tod) / (1000 * 60 * 60 * 24) <= 60
  }).map(b => {
    const rev = new Date(b.date_revision_anniversaire)
    const rty = new Date(tod.getFullYear(), rev.getMonth(), rev.getDate())
    if (rty < tod) rty.setFullYear(tod.getFullYear() + 1)
    const diff = Math.round((rty - tod) / (1000 * 60 * 60 * 24))
    return { ...b, diff, loc: locataires.find(l => l.id === b.locataire_id), bien: biens.find(x => x.id === b.bien_id) }
  })

  const kpis = [
    { l: 'Biens', v: biens.length, icon: <Building2 size={18} />, c: 'text-blue-500 bg-blue-50' },
    { l: 'Locataires', v: locataires.length, icon: <Users size={18} />, c: 'text-purple-500 bg-purple-50' },
    { l: 'Baux actifs', v: bauxActifs.length, icon: <FileText size={18} />, c: 'text-emerald-500 bg-emerald-50' },
    { l: 'Total encaissé', v: fmt(totalEnc), icon: <Euro size={18} />, c: 'text-emerald-500 bg-emerald-50' },
    { l: "Taux d'occupation", v: tauxOcc + '%', icon: <TrendingUp size={18} />, c: 'text-amber-500 bg-amber-50' },
    { l: 'Impayés', v: fmt(totalImp), icon: <AlertTriangle size={18} />, c: 'text-red-500 bg-red-50' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-navy mb-0.5">Tableau de bord</h1>
      <p className="text-gray-400 mb-8">Vue d'ensemble de votre patrimoine immobilier</p>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {kpis.map((k, i) => (
          <Card key={i} className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-400 mb-2 font-medium">{k.l}</p>
                <p className="text-2xl font-extrabold text-navy">{k.v}</p>
              </div>
              <div className={`${k.c} p-2.5 rounded-xl`}>{k.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Export PDF */}
      {biens.length > 0 && (
        <div className="flex justify-end mb-6">
          <Btn variant="ghost" onClick={() => pdfPortfolio(selected, biens, baux, transactions, locataires)}>
            <Download size={14} className="mr-1" /> Export PDF Portfolio
          </Btn>
        </div>
      )}

      {/* Alertes révision */}
      {alertesRevision.length > 0 && (
        <Card className="p-6 border-amber-200 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">📅</span>
            <h3 className="text-sm font-bold text-navy">Révisions de loyer à venir ({alertesRevision.length})</h3>
          </div>
          {alertesRevision.map(a => (
            <div key={a.id} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0">
              <div>
                <p className="font-semibold text-navy text-sm">{a.loc?.raison_sociale || `${a.loc?.prenom} ${a.loc?.nom}` || '—'}</p>
                <p className="text-xs text-gray-400">{a.bien?.adresse} — Indice {a.indice_revision || 'ILC'}</p>
              </div>
              <span className={`${a.diff <= 30 ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'} px-2.5 py-0.5 rounded-full text-xs font-semibold`}>
                {a.diff === 0 ? "Aujourd'hui" : a.diff < 0 ? `${Math.abs(a.diff)}j de retard` : `Dans ${a.diff} jours`}
              </span>
            </div>
          ))}
        </Card>
      )}

      {/* Charts */}
      {biens.length > 0 && <DashboardCharts biens={biens} baux={baux} transactions={transactions} locataires={locataires} selected={selected} />}

      {/* Alertes impayés */}
      {alertes.length > 0 && (
        <Card className="p-6 border-red-200">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-red-500" />
            <h3 className="text-sm font-bold text-navy">Alertes impayés ({alertes.length})</h3>
          </div>
          {alertes.slice(0, 6).map(a => {
            const bail = baux.find(b => b.id === a.bail_id)
            const loc = bail ? locataires.find(l => l.id === bail.locataire_id) : null
            const bien = bail ? biens.find(b => b.id === bail.bien_id) : null
            return (
              <div key={a.id} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-semibold text-navy text-sm">{loc?.raison_sociale || `${loc?.prenom} ${loc?.nom}` || '—'}</p>
                  <p className="text-xs text-gray-400">{bien?.adresse} — {MONTHS[a.mois]} {a.annee}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-red-500 text-sm">{fmt(a.montant_loyer + a.montant_charges)}</p>
                  <Badge value="impayé" />
                </div>
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function DashboardCharts({ biens, baux, transactions }) {
  const byVille = useMemo(() => {
    const map = {}
    biens.forEach(b => { map[b.ville || 'Autre'] = (map[b.ville || 'Autre'] || 0) + 1 })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [biens])

  const byType = useMemo(() => {
    const map = {}
    biens.forEach(b => { map[b.type || 'Autre'] = (map[b.type || 'Autre'] || 0) + 1 })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [biens])

  const rdtData = useMemo(() =>
    biens.filter(b => b.prix_achat && b.loyer_mensuel).map(b => ({
      name: b.reference || b.adresse?.slice(0, 15) || '?',
      rendement: parseFloat(((rendementBrut(b) || 0) * 100).toFixed(1)),
    })),
    [biens]
  )

  const currentYear = new Date().getFullYear()
  const loyerEvolution = useMemo(() =>
    Array.from({ length: 12 }, (_, m) => {
      const total = transactions
        .filter(t => t.annee === currentYear && t.mois === m && t.statut === 'payé')
        .reduce((s, t) => s + (t.montant_loyer || 0), 0)
      return { mois: MONTHS_SHORT[m], loyer: Math.round(total) }
    }),
    [transactions, currentYear]
  )

  return (
    <div className="grid grid-cols-2 gap-4 mb-8">
      {/* Pie - par ville */}
      <Card className="p-5">
        <h3 className="text-sm font-bold text-navy mb-3">Répartition par ville</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={byVille} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 11 }}>
              {byVille.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {/* Pie - par type */}
      <Card className="p-5">
        <h3 className="text-sm font-bold text-navy mb-3">Répartition par type</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={byType} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 11 }}>
              {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {/* Bar - rendements */}
      {rdtData.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-bold text-navy mb-3">Rendement brut par bien (%)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rdtData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="rendement" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Line - loyers encaissés */}
      <Card className="p-5">
        <h3 className="text-sm font-bold text-navy mb-3">Loyers encaissés {currentYear}</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={loyerEvolution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Line type="monotone" dataKey="loyer" name="Loyers" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
