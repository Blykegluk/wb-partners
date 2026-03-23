import { CreditCard, Building2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { fmt, MONTHS, today } from '../lib/utils'
import { pdfAvisEcheance, pdfFacture, pdfQuittance, pdfRelance, pdfMiseEnDemeure, pdfCommandement } from '../lib/pdf'
import { PageHeader, Card, Badge, Empty, Btn } from '../components/UI'

export default function Transactions({ navigate }) {
  const { transactions, baux, biens, locataires, selected, canEdit, reload } = useSociete()

  const markPaid = async (id) => {
    await supabase.from('transactions').update({ statut: 'payé', date_paiement: today() }).eq('id', id)
    reload()
  }

  const relancer = async (id, count) => {
    await supabase.from('transactions').update({ relance_count: count + 1 }).eq('id', id)
    reload()
  }

  const getContext = (t) => {
    const bail = baux.find(b => b.id === t.bail_id)
    const loc = bail ? locataires.find(l => l.id === bail.locataire_id) : null
    const bien = bail ? biens.find(b => b.id === bail.bien_id) : null
    return { bail, loc, bien }
  }

  return (
    <div>
      <PageHeader title="Transactions" sub="Historique des paiements" />

      {transactions.length === 0 ? (
        <Empty icon={<CreditCard size={40} />} text="Aucune transaction." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Locataire', 'Bien', 'Période', 'Montant HT', 'Statut', 'Relances', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => {
                const { bail, loc, bien } = getContext(t)
                const soc = selected
                return (
                  <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <button onClick={() => navigate('locataires')} className="text-sm font-semibold text-navy hover:text-blue-600 cursor-pointer flex items-center gap-1">
                        <Users size={13} className="text-gray-300" />
                        {loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || '—'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => navigate('biens')} className="text-sm text-gray-500 hover:text-blue-600 cursor-pointer flex items-center gap-1">
                        <Building2 size={13} className="text-gray-300" />
                        {bien?.reference || bien?.adresse?.slice(0, 20) || '—'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{MONTHS[t.mois]} {t.annee}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-navy">{fmt(t.montant_loyer + t.montant_charges)}</td>
                    <td className="px-4 py-3"><Badge value={t.statut} /></td>
                    <td className="px-4 py-3 text-sm">
                      {(t.relance_count || 0) > 0 ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          t.relance_count >= 3 ? 'bg-red-100 text-red-600' :
                          t.relance_count >= 2 ? 'bg-orange-100 text-orange-600' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {t.relance_count} relance{t.relance_count > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {t.statut !== 'payé' && canEdit && (
                          <Btn variant="green" className="!px-2 !py-1 !text-xs" onClick={() => markPaid(t.id)}>Payé</Btn>
                        )}
                        {t.statut === 'impayé' && canEdit && (
                          <Btn variant="orange" className="!px-2 !py-1 !text-xs" onClick={() => relancer(t.id, t.relance_count || 0)}>Relancer</Btn>
                        )}
                        {bail && bien && loc && (
                          <>
                            <Btn variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => pdfAvisEcheance(bail, bien, loc, soc, t.mois, t.annee)}>Avis</Btn>
                            <Btn variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => pdfFacture(bail, bien, loc, soc, t.mois, t.annee)}>Facture</Btn>
                            {t.statut === 'payé' && (
                              <Btn variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => pdfQuittance(bail, bien, loc, soc, t)}>Quittance</Btn>
                            )}
                            {t.statut === 'impayé' && (
                              <>
                                <Btn variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => pdfRelance(bail, bien, loc, soc, transactions)}>Relance</Btn>
                                <Btn variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => pdfMiseEnDemeure(bail, bien, loc, soc, transactions)}>MED</Btn>
                                <Btn variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => pdfCommandement(bail, bien, loc, soc, transactions)}>Cmd.</Btn>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
