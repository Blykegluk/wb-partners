import { useState, useMemo } from 'react'
import { Landmark } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useSociete } from '../contexts/Societe'
import { fmt, MONTHS_SHORT, fmtDate } from '../lib/utils'
import { fluxReelsParMois, POSTES_SORTIES } from '../lib/calculs'
import { PageHeader, Card, Sel, Kpi, KpiRow } from '../components/UI'

const COULEURS_SORTIES = {
  prets: '#3b82f6', impots: '#f59e0b', travaux: '#8b5cf6',
  copro: '#94a3b8', exploitation: '#64748b', capital: '#0ea5e9', autres: '#cbd5e1',
}

// Trésorerie sur flux bancaires réels : entrées et sorties telles qu'elles
// ont traversé les comptes, ventilées par nature qualifiée dans Banque, et
// solde réel en fin de mois. L'ancienne version projetait des forfaits
// (annuités, TF/12, charges des fiches biens) face à des loyers déclarés en
// HT — elle ne subsiste qu'en repli quand aucune banque n'est connectée.
export default function Tresorerie({ navigate }) {
  const { biens, baux, transactions, bankAccounts, bankTransactions } = useSociete()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const reel = useMemo(
    () => fluxReelsParMois({ bankAccounts, bankTransactions, annee: year }),
    [bankAccounts, bankTransactions, year],
  )

  const anneeDebut = reel?.debut ? new Date(reel.debut).getFullYear() : currentYear - 4
  const years = Array.from({ length: Math.max(1, currentYear - anneeDebut + 1) }, (_, i) => currentYear - i)

  if (reel) {
    const data = reel.mois.map((m) => ({
      mois: MONTHS_SHORT[m.mois],
      loyers: Math.round(m.loyers),
      autresRecettes: Math.round(m.autresRecettes),
      ...Object.fromEntries(POSTES_SORTIES.map((p) => [p.k, Math.round(m.sorties[p.k])])),
    }))
    const totalEntrees = reel.mois.reduce((s, m) => s + m.entrees, 0)
    const totalSorties = reel.mois.reduce((s, m) => s + m.totalSorties, 0)
    // Seuls les mouvements réellement non qualifiés comptent ici — une
    // dépense classée « autre dépense » a déjà été arbitrée.
    const nonQualifiees = reel.mois.reduce((s, m) => s + m.aQualifier, 0)
    const anneeVide = totalEntrees === 0 && totalSorties === 0

    // La trésorerie est un instantané : chaque point du graphe de solde est
    // daté précisément — les 1ers du mois couverts par l'historique, puis
    // aujourd'hui si l'année affichée est en cours.
    const now = new Date()
    const snapshots = []
    for (let m = 0; m < 12; m++) {
      const iso = `${year}-${String(m + 1).padStart(2, '0')}-01`
      if (reel.debut && iso >= reel.debut && new Date(year, m, 1) <= now) {
        snapshots.push({
          date: `01/${String(m + 1).padStart(2, '0')}/${year}`,
          solde: Math.round(reel.soldeALaDate(iso)),
        })
      }
    }
    if (year === now.getFullYear()) {
      const dd = String(now.getDate()).padStart(2, '0')
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      snapshots.push({ date: `${dd}/${mm}/${year}`, solde: Math.round(reel.soldeActuel) })
    }

    return (
      <div>
        <PageHeader title="Trésorerie" sub={`Flux bancaires réels ${year}`}>
          <Sel value={year} onChange={e => setYear(parseInt(e.target.value))} options={years.map(y => ({ v: y, l: y }))} />
        </PageHeader>

        <KpiRow cols={3}>
          <Kpi label="Solde bancaire actuel" value={fmt(reel.soldeActuel)} tone="brand"
            sub="Comptes suivis, rafraîchi chaque matin" />
          <Kpi label={`Entrées réelles ${year}`} value={fmt(totalEntrees)} tone="positive"
            sub="Crédits constatés en banque" />
          <Kpi label={`Sorties réelles ${year}`} value={fmt(totalSorties)} tone="negative"
            sub="Débits constatés en banque" />
        </KpiRow>

        {anneeVide && (
          <Card className="p-4 mb-6 border-gray-200 bg-gray-50/60">
            <p className="text-sm text-gray-500">
              Aucun flux bancaire en {year} : l'historique transmis par la banque
              commence le {fmtDate(reel.debut)}. Les années antérieures n'ont pas
              de vérité bancaire — rien n'est estimé à leur place.
            </p>
          </Card>
        )}
        <p className="text-xs text-gray-400 mb-6">
          Données exactes depuis le {fmtDate(reel.debut)}, début de l'historique transmis par la
          banque — avant cette date, la courbe s'interrompt plutôt que d'estimer.
          {nonQualifiees > 0 && (
            <>
              {' '}<strong className="text-gray-500">{fmt(nonQualifiees)}</strong> de sorties restent à
              qualifier dans{' '}
              <button onClick={() => navigate?.('flux', { tab: 'banque' })}
                className="font-semibold text-blue-500 hover:underline cursor-pointer">Banque</button>{' '}
              pour affiner la ventilation.
            </>
          )}
        </p>

        <Card className="p-5 mb-6">
          <h3 className="text-sm font-bold text-navy mb-4">Entrées vs sorties réelles, par nature</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend />
              <Bar dataKey="loyers" name="Loyers encaissés" stackId="in" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="autresRecettes" name="Autres recettes" stackId="in" fill="#86efac" radius={[4, 4, 0, 0]} />
              {POSTES_SORTIES.map((p, i) => (
                <Bar key={p.k} dataKey={p.k} name={p.l} stackId="out"
                  fill={COULEURS_SORTIES[p.k]} radius={i === POSTES_SORTIES.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold text-navy mb-4">Solde bancaire réel, à date exacte</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={snapshots} margin={{ left: 8, right: 32 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={0} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} domain={['auto', 'auto']} />
              <Tooltip formatter={(v) => [fmt(v), 'Solde']} labelFormatter={(d) => `Au ${d}`} />
              <Line type="monotone" dataKey="solde" name="Solde réel" stroke="#1a2d4e"
                strokeWidth={2.5} dot={{ fill: '#1a2d4e', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    )
  }

  // ── Repli déclaratif (aucune banque connectée) ───────────────
  return <TresorerieDeclarative biens={biens} baux={baux} transactions={transactions}
    year={year} setYear={setYear} years={years} navigate={navigate} />
}

function TresorerieDeclarative({ biens, baux, transactions, year, setYear, years, navigate }) {
  const data = useMemo(() => {
    const activeBaux = baux.filter(b => b.actif)
    const activeBienIds = [...new Set(activeBaux.map(b => b.bien_id))]
    const activeBiens = biens.filter(b => activeBienIds.includes(b.id))

    const annuitesTotal = activeBiens.reduce((s, b) => s + (b.annuites || 0), 0)
    const tfMensuel = activeBiens.reduce((s, b) => s + ((b.taxe_fonciere || 0) / 12), 0)
    const chargesTotal = activeBiens.reduce((s, b) => s + (b.charges || 0), 0)

    let cumulatif = 0
    return Array.from({ length: 12 }, (_, mois) => {
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

  return (
    <div>
      <PageHeader title="Trésorerie" sub={`Projection déclarative ${year}`}>
        <Sel value={year} onChange={e => setYear(parseInt(e.target.value))} options={years.map(y => ({ v: y, l: y }))} />
      </PageHeader>

      <Card className="p-4 mb-6 border-amber-200 bg-amber-50/40">
        <div className="flex items-start gap-3">
          <Landmark size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-navy">
            <strong>Aucun compte bancaire connecté</strong> — ces chiffres sont une projection :
            loyers déclarés payés (HT) face à des sorties forfaitaires tirées des fiches biens.{' '}
            <button onClick={() => navigate?.('parametres', { tab: 'banque' })}
              className="font-semibold text-blue-500 hover:underline cursor-pointer">
              Connecter la banque
            </button>{' '}
            pour passer aux flux réels.
          </p>
        </div>
      </Card>

      <KpiRow cols={3}>
        <Kpi label="Total entrées" value={fmt(totalEntrees)} tone="positive" sub="Loyers déclarés payés (HT)" />
        <Kpi label="Total sorties" value={fmt(totalSorties)} tone="negative" sub="Annuités, charges, taxe foncière (estimées)" />
        <Kpi
          label="Solde annuel"
          value={fmt(soldeAnnuel)}
          tone={soldeAnnuel >= 0 ? 'positive' : 'negative'}
          sub={`Projection ${year}`}
        />
      </KpiRow>

      <Card className="p-5 mb-6">
        <h3 className="text-sm font-bold text-navy mb-4">Entrées vs Sorties mensuelles</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Legend />
            <Bar dataKey="entrees" name="Loyers déclarés" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="annuites" name="Annuités" fill="#3b82f6" stackId="sorties" radius={[0, 0, 0, 0]} />
            <Bar dataKey="taxeFonciere" name="Taxe foncière" fill="#f59e0b" stackId="sorties" radius={[0, 0, 0, 0]} />
            <Bar dataKey="charges" name="Charges" fill="#94a3b8" stackId="sorties" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-bold text-navy mb-4">Solde cumulé (projection)</h3>
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
