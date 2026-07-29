import { useState, useEffect } from 'react'
import Finances from './Finances'
import Transactions from './Transactions'
import Banque from './Banque'
import Ecarts from './Ecarts'
import Relances from './Relances'
import TVA from './TVA'

// « Écarts » se place entre l'échéancier et la banque parce qu'il les
// confronte : l'un dit ce qui est dû, l'autre ce qui est entré.
const TABS = [
  { key: 'echeancier', label: 'Échéancier' },
  { key: 'ecarts', label: 'Écarts' },
  { key: 'banque', label: 'Banque' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'relances', label: 'Relances' },
  { key: 'tva', label: 'Balance TVA' },
]

export default function FinancesHub({ navigate, navState, setNavState }) {
  const [tab, setTab] = useState('echeancier')

  useEffect(() => {
    if (navState?.tab && TABS.find(t => t.key === navState.tab)) {
      setTab(navState.tab)
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

      <div style={{ display: tab === 'echeancier' ? 'block' : 'none' }}>
        <Finances navigate={navigate} />
      </div>
      <div style={{ display: tab === 'ecarts' ? 'block' : 'none' }}>
        <Ecarts navigate={navigate} />
      </div>
      <div style={{ display: tab === 'banque' ? 'block' : 'none' }}>
        <Banque navigate={navigate} />
      </div>
      <div style={{ display: tab === 'transactions' ? 'block' : 'none' }}>
        <Transactions navigate={navigate} />
      </div>
      <div style={{ display: tab === 'relances' ? 'block' : 'none' }}>
        <Relances navigate={navigate} />
      </div>
      <div style={{ display: tab === 'tva' ? 'block' : 'none' }}>
        <TVA />
      </div>
    </div>
  )
}
