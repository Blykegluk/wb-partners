import { useState, useMemo } from 'react'
import { Scale, AlertTriangle, HelpCircle, TrendingDown, Landmark } from 'lucide-react'
import { useSociete } from '../contexts/Societe'
import { fmt, fmtDate, MONTHS, MONTHS_SHORT } from '../lib/utils'
import { ecartsEncaissement } from '../lib/calculs'
import { Card, Empty, Kpi, KpiRow } from '../components/UI'

const now = new Date()

// Écart entre l'échéancier et la banque.
//
// L'échéancier répond à « qu'est-ce qui est dû ? », la banque à « qu'est-ce
// qui est entré ? ». Personne ne répondait à « est-ce que ça correspond ? » —
// or c'est la seule question qui révèle un loyer manquant, un virement
// partiel, ou une échéance soldée à la main sans encaissement réel.
export default function Ecarts({ navigate }) {
  const {
    baux, biens, locataires, transactions, bankTransactions, bankAccounts,
  } = useSociete()
  const [annee, setAnnee] = useState(now.getFullYear())

  const annees = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
  const banqueConnectee = bankAccounts.length > 0

  const e = useMemo(
    () => ecartsEncaissement({ baux, biens, transactions, bankTransactions, annee }),
    [baux, biens, transactions, bankTransactions, annee],
  )

  const libelleEcheance = (ech) => {
    const bail = baux.find(b => b.id === ech.bail_id)
    const loc = bail ? locataires.find(l => l.id === bail.locataire_id) : null
    const bien = bail ? biens.find(b => b.id === bail.bien_id) : null
    const nom = loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || 'Locataire'
    return `${nom} — ${MONTHS[ech.mois]} ${ech.annee}${bien ? ` · ${bien.reference || bien.ville}` : ''}`
  }

  const tauxCouverture = e.total.attendu > 0
    ? Math.round(e.total.encaisse / e.total.attendu * 100)
    : 0

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-navy mb-0.5">Écarts</h1>
          <p className="text-gray-400 text-sm">
            Ce qui est dû, comparé à ce qui est réellement entré en banque —
            <strong className="text-gray-500"> montants TTC</strong>, l'échéancier
            étant tenu en HT
          </p>
        </div>
        <div className="flex gap-2">
          {annees.map(y => (
            <button key={y} onClick={() => setAnnee(y)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
                annee === y ? 'bg-navy text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
              }`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {!banqueConnectee && (
        <Card className="p-4 mb-6 border-amber-200 bg-amber-50/40">
          <div className="flex items-start gap-3">
            <Landmark size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-navy">Aucun compte bancaire connecté</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Sans connexion bancaire, l'encaissement réel est inconnu : seul le
                déclaratif est affiché, et l'écart n'a pas de sens.
              </p>
            </div>
          </div>
        </Card>
      )}

      <KpiRow cols={4} className="mb-8">
        <Kpi label={`Attendu ${annee} TTC`} value={fmt(e.total.attendu)} tone="brand"
          sub="Loyers et charges des baux en cours" />
        <Kpi label="Encaissé en banque" value={fmt(e.total.encaisse)} tone="positive"
          sub={`${tauxCouverture} % de l'attendu`} />
        <Kpi label="Écart" value={fmt(e.ecart)} tone={e.ecart < -0.01 ? 'negative' : 'positive'}
          sub={e.ecart < -0.01 ? 'Manque à encaisser' : 'Encaissé au moins autant que prévu'} />
        <Kpi label="Déclaré sans virement" value={fmt(
          e.declareSansVirement.reduce((s, t) => s + t.duTTC, 0)
        )} tone="warn" sub={`${e.declareSansVirement.length} échéance${e.declareSansVirement.length > 1 ? 's' : ''}`} />
      </KpiRow>

      {/* Mois par mois */}
      <Card className="overflow-x-auto mb-6">
        <table className="w-full text-sm" style={{ minWidth: 640 }}>
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Mois</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Attendu</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Déclaré payé</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Encaissé banque</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Écart</th>
            </tr>
          </thead>
          <tbody>
            {e.mois.map(m => {
              const ecart = m.encaisse - m.attendu
              const futur = new Date(annee, m.mois, 1) > new Date(now.getFullYear(), now.getMonth(), 1)
              const vide = m.attendu === 0 && m.declare === 0 && m.encaisse === 0
              return (
                <tr key={m.mois} className={`border-t border-gray-50 ${vide ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2.5 font-semibold text-navy">
                    {MONTHS_SHORT[m.mois]}
                    {m.mois === now.getMonth() && annee === now.getFullYear() && (
                      <span className="ml-2 text-[10px] font-bold uppercase text-blue-500">en cours</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-navy">{fmt(m.attendu)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{fmt(m.declare)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{fmt(m.encaisse)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${
                    Math.abs(ecart) < 0.01 ? 'text-gray-300'
                      : ecart < 0 ? (futur ? 'text-gray-400' : 'text-red-500')
                      : 'text-emerald-600'
                  }`}>
                    {Math.abs(ecart) < 0.01 ? '—' : fmt(ecart)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-100 bg-gray-50 font-bold">
              <td className="px-4 py-3 text-navy">Total {annee}</td>
              <td className="px-4 py-3 text-right text-navy">{fmt(e.total.attendu)}</td>
              <td className="px-4 py-3 text-right text-gray-500">{fmt(e.total.declare)}</td>
              <td className="px-4 py-3 text-right text-emerald-600">{fmt(e.total.encaisse)}</td>
              <td className={`px-4 py-3 text-right ${e.ecart < -0.01 ? 'text-red-500' : 'text-emerald-600'}`}>
                {fmt(e.ecart)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* Ce qui explique l'écart */}
      <h2 className="text-sm font-bold text-navy mb-3">Ce qui explique l'écart</h2>

      <div className="space-y-4">
        <Bloc
          titre="Échéances impayées"
          icone={<TrendingDown size={15} className="text-red-500" />}
          vide="Aucune échéance impayée."
          lignes={e.impayees.map(t => ({
            id: t.id,
            gauche: libelleEcheance(t),
            droite: fmt(t.duTTC),
            ton: 'text-red-500',
          }))}
          action={() => navigate?.('flux', { tab: 'transactions' })}
          actionLabel="Voir les transactions"
        />

        <Bloc
          titre="Déclaré payé sans virement rapproché"
          icone={<AlertTriangle size={15} className="text-amber-500" />}
          note="Ces échéances sont marquées payées mais aucun virement ne l'atteste. Légitime pour un paiement en espèces ou une compensation, à vérifier sinon."
          vide="Toutes les échéances soldées sont adossées à un virement."
          lignes={e.declareSansVirement.map(t => ({
            id: t.id,
            gauche: libelleEcheance(t),
            droite: fmt(t.duTTC),
            ton: 'text-amber-600',
          }))}
        />

        <Bloc
          titre="Virements d'un montant différent de l'échéance"
          icone={<Scale size={15} className="text-blue-500" />}
          note="Le rapprochement tolère un écart de montant : un paiement partiel, une régularisation de charges ou une indexation passe donc pour rapproché. Le motif s'indique au moment du rapprochement."
          vide="Aucun écart de montant."
          lignes={e.ecartsMontant.map(x => ({
            id: x.mouvement.id,
            gauche: `${libelleEcheance(x.echeance)} — dû ${fmt(x.du)}, reçu ${fmt(x.recu)}${x.motif ? ` · ${x.motif}` : ''}`,
            droite: `${x.delta > 0 ? '+' : ''}${fmt(x.delta)}`,
            ton: x.motif ? 'text-gray-400' : x.delta < 0 ? 'text-red-500' : 'text-emerald-600',
          }))}
        />

        <Bloc
          titre="Crédits reçus non rattachés"
          icone={<HelpCircle size={15} className="text-gray-400" />}
          note="De l'argent est entré sans qu'on sache à quoi il correspond."
          vide="Tous les crédits sont qualifiés."
          lignes={e.creditsNonRattaches.map(t => ({
            id: t.id,
            gauche: `${fmtDate(t.booking_date)} · ${(t.remittance_information || t.counterparty_name || '—').slice(0, 70)}`,
            droite: fmt(Number(t.amount)),
            ton: 'text-navy',
          }))}
          action={() => navigate?.('flux', { tab: 'banque' })}
          actionLabel="Qualifier dans Banque"
        />
      </div>
    </div>
  )
}

function Bloc({ titre, icone, note, vide, lignes, action, actionLabel }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h3 className="text-sm font-bold text-navy flex items-center gap-2">
          {icone}
          {titre}
          <span className="text-xs font-semibold text-gray-300">{lignes.length}</span>
        </h3>
        {action && lignes.length > 0 && (
          <button onClick={action}
            className="text-xs font-semibold text-blue-500 hover:underline cursor-pointer whitespace-nowrap">
            {actionLabel}
          </button>
        )}
      </div>
      {note && <p className="text-xs text-gray-400 mb-3">{note}</p>}

      {lignes.length === 0 ? (
        <p className="text-xs text-gray-300 italic">{vide}</p>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {lignes.map(l => (
            <div key={l.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-sm text-gray-600 truncate">{l.gauche}</span>
              <span className={`text-sm font-semibold whitespace-nowrap ${l.ton}`}>{l.droite}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
