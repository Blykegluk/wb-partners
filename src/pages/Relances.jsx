import { AlertTriangle, Send, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { fmt, MONTHS, today } from '../lib/utils'
import { pdfRelance, pdfMiseEnDemeure, pdfCommandement } from '../lib/pdf'
import { PageHeader, Card, Badge, Btn, Empty } from '../components/UI'

const PALIERS = [
  { min: 30, label: 'Commandement de payer', color: 'bg-red-100 text-red-700', severity: 3 },
  { min: 15, label: 'Mise en demeure', color: 'bg-orange-100 text-orange-700', severity: 2 },
  { min: 5, label: 'Relance amiable', color: 'bg-yellow-100 text-yellow-700', severity: 1 },
]

export default function Relances() {
  const { transactions, baux, biens, locataires, selected, canEdit, reload } = useSociete()

  // Only unpaid transactions
  const impayes = transactions
    .filter(t => t.statut === 'impayé')
    .map(t => {
      const dueDate = new Date(t.annee, t.mois, 1)
      const joursRetard = Math.round((new Date() - dueDate) / (1000 * 60 * 60 * 24))
      const palier = PALIERS.find(p => joursRetard >= p.min) || null
      const bail = baux.find(b => b.id === t.bail_id)
      const loc = bail ? locataires.find(l => l.id === bail.locataire_id) : null
      const bien = bail ? biens.find(b => b.id === bail.bien_id) : null
      return { ...t, joursRetard, palier, bail, loc, bien }
    })
    .filter(t => t.joursRetard >= 5)
    .sort((a, b) => b.joursRetard - a.joursRetard)

  const markPaid = async (id) => {
    await supabase.from('transactions').update({ statut: 'payé', date_paiement: today() }).eq('id', id)
    reload()
  }

  const sendRelance = async (t) => {
    // Increment relance count
    await supabase.from('transactions').update({ relance_count: (t.relance_count || 0) + 1 }).eq('id', t.id)
    reload()

    // Generate appropriate PDF
    if (!t.bail || !t.bien || !t.loc) return
    const soc = selected
    const allTx = transactions

    if (t.palier?.severity === 3) {
      pdfCommandement(t.bail, t.bien, t.loc, soc, allTx)
    } else if (t.palier?.severity === 2) {
      pdfMiseEnDemeure(t.bail, t.bien, t.loc, soc, allTx)
    } else {
      pdfRelance(t.bail, t.bien, t.loc, soc, allTx)
    }
  }

  const stats = {
    total: impayes.length,
    amiable: impayes.filter(t => t.palier?.severity === 1).length,
    med: impayes.filter(t => t.palier?.severity === 2).length,
    cmd: impayes.filter(t => t.palier?.severity === 3).length,
    montant: impayes.reduce((s, t) => s + (t.montant_loyer || 0) + (t.montant_charges || 0), 0),
  }

  return (
    <div>
      <PageHeader title="Relances" sub="Gestion des impayés par paliers" />

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <Card>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total impayés</p>
          <p className="text-2xl font-bold text-navy mt-1">{stats.total}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Montant total</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{fmt(stats.montant)}</p>
        </Card>
        <Card>
          <p className="text-xs text-yellow-600 uppercase tracking-wide">Amiables</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{stats.amiable}</p>
        </Card>
        <Card>
          <p className="text-xs text-orange-600 uppercase tracking-wide">Mises en demeure</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{stats.med}</p>
        </Card>
        <Card>
          <p className="text-xs text-red-600 uppercase tracking-wide">Commandements</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.cmd}</p>
        </Card>
      </div>

      {impayes.length === 0 ? (
        <Empty icon={<AlertTriangle size={40} />} text="Aucun impayé en retard de plus de 5 jours." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Locataire', 'Bien', 'Période', 'Montant', 'Retard', 'Palier', 'Relances', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {impayes.map(t => (
                <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm font-semibold text-navy">
                    {t.loc?.raison_sociale || `${t.loc?.prenom || ''} ${t.loc?.nom || ''}`.trim() || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{t.bien?.reference || t.bien?.adresse?.slice(0, 20) || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{MONTHS[t.mois]} {t.annee}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-navy">{fmt(t.montant_loyer + t.montant_charges)}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold text-red-600">J+{t.joursRetard}</span>
                  </td>
                  <td className="px-4 py-3">
                    {t.palier && (
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${t.palier.color}`}>
                        {t.palier.label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {(t.relance_count || 0) > 0 ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        t.relance_count >= 3 ? 'bg-red-100 text-red-600' :
                        t.relance_count >= 2 ? 'bg-orange-100 text-orange-600' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {t.relance_count}
                      </span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <div className="flex gap-1.5">
                        <Btn variant="orange" className="!px-2 !py-1 !text-xs" onClick={() => sendRelance(t)}>
                          <Send size={12} className="mr-1" />Relancer
                        </Btn>
                        <Btn variant="green" className="!px-2 !py-1 !text-xs" onClick={() => markPaid(t.id)}>
                          <Check size={12} className="mr-1" />Payé
                        </Btn>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
