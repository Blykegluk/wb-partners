import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { fmt, MONTHS_SHORT, getLoyerPourMois, today } from '../lib/utils'
import { Card, Empty } from '../components/UI'

const now = new Date()

export default function Finances() {
  const { baux, biens, locataires, transactions, selected, reload } = useSociete()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
  const bauxActifs = baux.filter(b => b.actif)

  const getStatutMois = (bailId, mois, annee) =>
    transactions.find(t => t.bail_id === bailId && t.mois === mois && t.annee === annee)

  const totalAttendu = bauxActifs.reduce((sum, b) => {
    let total = 0
    for (let m = 0; m < 12; m++) total += getLoyerPourMois(b, m, selectedYear) + (b.charges || 0)
    return sum + total
  }, 0)

  const totalEncaisse = transactions
    .filter(t => t.statut === 'payé' && t.annee === selectedYear)
    .reduce((s, t) => s + t.montant_loyer + t.montant_charges, 0)

  const totalImpaye = transactions
    .filter(t => t.statut === 'impayé' && t.annee === selectedYear)
    .reduce((s, t) => s + t.montant_loyer + t.montant_charges, 0)

  const markPaid = async (txId) => {
    await supabase.from('transactions').update({ statut: 'payé', date_paiement: today() }).eq('id', txId)
    reload()
  }

  const createAndMark = async (bail, mois, annee, statut = 'payé') => {
    const loyer = getLoyerPourMois(bail, mois, annee)
    await supabase.from('transactions').insert({
      societe_id: selected.id, bail_id: bail.id, mois, annee,
      montant_loyer: loyer, montant_charges: bail.charges || 0,
      statut, date_paiement: statut === 'payé' ? today() : null, relance_count: 0,
    })
    reload()
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-navy mb-0.5">Finances</h1>
          <p className="text-gray-400 text-sm">Échéancier et suivi des paiements</p>
        </div>
        <div className="flex gap-2">
          {years.map(y => (
            <button key={y} onClick={() => setSelectedYear(y)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
                selectedYear === y ? 'bg-navy text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
              }`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { l: `Attendu ${selectedYear}`, v: fmt(totalAttendu), c: 'text-blue-500', sub: 'Total loyers + charges' },
          { l: 'Encaissé', v: fmt(totalEncaisse), c: 'text-emerald-500', sub: `${totalAttendu > 0 ? Math.round(totalEncaisse / totalAttendu * 100) : 0}% du total` },
          { l: 'Impayés', v: fmt(totalImpaye), c: 'text-red-500', sub: 'À recouvrer' },
        ].map((k, i) => (
          <Card key={i} className="p-5">
            <p className="text-xs text-gray-400 mb-1 font-medium">{k.l}</p>
            <p className={`text-xl font-extrabold ${k.c} mb-1`}>{k.v}</p>
            <p className="text-xs text-gray-400">{k.sub}</p>
          </Card>
        ))}
      </div>

      {/* Échéancier */}
      {bauxActifs.length === 0 ? <Empty icon={<Calendar size={40} />} text="Aucun bail actif." /> : (
        <Card className="overflow-auto">
          <table className="w-full border-collapse" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th className="sticky left-0 bg-gray-50 z-10 px-4 py-3 text-xs font-bold text-gray-400 uppercase text-left min-w-[160px]">Locataire / Bien</th>
                {MONTHS_SHORT.map((m, i) => (
                  <th key={i} className={`px-2 py-3 text-xs font-bold text-gray-400 uppercase text-center min-w-[72px] ${
                    i === now.getMonth() && selectedYear === now.getFullYear() ? 'bg-blue-50' : 'bg-gray-50'
                  }`}>{m}</th>
                ))}
                <th className="bg-gray-50 px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {bauxActifs.map(b => {
                const loc = locataires.find(l => l.id === b.locataire_id)
                const bien = biens.find(x => x.id === b.bien_id)
                const debutBail = b.date_debut ? new Date(b.date_debut) : null
                const finBail = b.date_fin ? new Date(b.date_fin) : null
                let totalAnnee = 0
                return (
                  <tr key={b.id} className="border-t border-gray-50">
                    <td className="sticky left-0 bg-white z-[1] px-4 py-2 border-r border-gray-100">
                      <p className="font-semibold text-navy text-xs">{loc?.raison_sociale || `${loc?.prenom} ${loc?.nom}` || '—'}</p>
                      <p className="text-[11px] text-gray-400">{bien?.reference || bien?.adresse?.slice(0, 18)}</p>
                    </td>
                    {MONTHS_SHORT.map((_, mois) => {
                      const loyer = getLoyerPourMois(b, mois, selectedYear)
                      const montant = loyer + (b.charges || 0)
                      totalAnnee += montant
                      const tx = getStatutMois(b.id, mois, selectedYear)
                      const isBeforeBail = debutBail && new Date(selectedYear, mois, 1) < new Date(debutBail.getFullYear(), debutBail.getMonth(), 1)
                      const isAfterBail = finBail && new Date(selectedYear, mois, 1) > finBail
                      const isFuture = new Date(selectedYear, mois, 1) > new Date(now.getFullYear(), now.getMonth(), 1)
                      const isCurrent = mois === now.getMonth() && selectedYear === now.getFullYear()

                      if (isBeforeBail || isAfterBail) {
                        return <td key={mois} className="text-center bg-gray-50 py-2"><span className="text-gray-200">—</span></td>
                      }

                      const statut = tx?.statut
                      let bg = ''
                      let color = 'text-navy'
                      if (statut === 'payé') { bg = 'bg-green-50'; color = 'text-green-600' }
                      else if (statut === 'impayé') { bg = 'bg-red-50'; color = 'text-red-600' }
                      else if (statut === 'en_attente') { bg = 'bg-yellow-50'; color = 'text-yellow-700' }
                      else if (isFuture) { bg = 'bg-gray-50'; color = 'text-gray-400' }
                      else { bg = 'bg-red-50'; color = 'text-red-600' }

                      return (
                        <td key={mois} className={`text-center py-2 px-1 ${isCurrent ? 'bg-blue-50 border border-blue-200' : bg}`}>
                          <div className={`text-[11px] font-semibold ${color} mb-0.5`}>
                            {fmt(montant).replace('€', '').replace(/\s/g, '').replace(',', ',')}
                          </div>
                          {tx ? (
                            statut === 'payé'
                              ? <span className="text-[9px] text-green-500">✓</span>
                              : <button onClick={() => markPaid(tx.id)} className="text-[9px] text-red-500 cursor-pointer bg-transparent border-none hover:underline">→ payé</button>
                          ) : !isFuture ? (
                            <button onClick={() => createAndMark(b, mois, selectedYear)} className="text-[9px] text-red-500 cursor-pointer bg-transparent border-none hover:underline">+ Enreg.</button>
                          ) : (
                            <button onClick={() => createAndMark(b, mois, selectedYear, 'en_attente')} className="text-[9px] text-gray-400 cursor-pointer bg-transparent border-none hover:underline">+ Prévoir</button>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-4 py-2 text-right font-bold text-navy text-sm whitespace-nowrap">{fmt(totalAnnee)}</td>
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
