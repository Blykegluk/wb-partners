import { useState } from 'react'
import Finances from './Finances'
import Transactions from './Transactions'
import Relances from './Relances'

const TABS = [
  { key: 'echeancier', label: 'Échéancier' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'relances', label: 'Relances' },
]

export default function FinancesHub({ navigate }) {
  const [tab, setTab] = useState('echeancier')

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

      {/* Tab content - use display:none to preserve state */}
      <div style={{ display: tab === 'echeancier' ? 'block' : 'none' }}>
        <Finances navigate={navigate} />
      </div>
      <div style={{ display: tab === 'transactions' ? 'block' : 'none' }}>
        <Transactions navigate={navigate} />
      </div>
      <div style={{ display: tab === 'relances' ? 'block' : 'none' }}>
        <Relances navigate={navigate} />
      </div>
    </div>
  )
}
