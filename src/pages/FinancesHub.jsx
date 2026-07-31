import { useState, useEffect } from 'react'
import SuiviLoyers from './SuiviLoyers'
import Banque from './Banque'
import TVA from './TVA'

// Refonte du Flux financier : les onglets Échéancier, Écarts, Transactions
// et Relances montraient les mêmes échéances sous quatre angles sans jamais
// les réunir. « Suivi des loyers » les remplace — une ligne par échéance, du
// dû au courrier envoyé. Banque et Balance TVA restent des outils à part.
const TABS = [
  { key: 'suivi', label: 'Suivi des loyers' },
  { key: 'banque', label: 'Banque' },
  { key: 'tva', label: 'Balance TVA' },
]

// Les liens internes historiques pointent encore vers les anciens onglets.
const ALIAS = {
  echeancier: 'suivi', ecarts: 'suivi', transactions: 'suivi', relances: 'suivi',
}

export default function FinancesHub({ navigate, navState, setNavState }) {
  const [tab, setTab] = useState('suivi')

  useEffect(() => {
    if (!navState?.tab) return
    const cible = ALIAS[navState.tab] || navState.tab
    if (TABS.find(t => t.key === cible)) {
      setTab(cible)
      setNavState(null)
    }
  }, [navState, setNavState])

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${tab === t.key ? 'bg-white text-navy shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: tab === 'suivi' ? 'block' : 'none' }}>
        <SuiviLoyers navigate={navigate} />
      </div>
      <div style={{ display: tab === 'banque' ? 'block' : 'none' }}>
        <Banque navigate={navigate} />
      </div>
      <div style={{ display: tab === 'tva' ? 'block' : 'none' }}>
        <TVA navigate={navigate} />
      </div>
    </div>
  )
}
