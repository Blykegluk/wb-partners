import { useState } from 'react'
import Tresorerie from './Tresorerie'
import Fiscal from './Fiscal'

const TABS = [
  { key: 'tresorerie', label: 'Trésorerie' },
  { key: 'fiscal', label: 'Fiscal' },
]

export default function Analyse({ navigate }) {
  const [tab, setTab] = useState('tresorerie')

  return (
    <div>
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${tab === t.key ? 'bg-white text-navy shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ display: tab === 'tresorerie' ? 'block' : 'none' }}>
        <Tresorerie navigate={navigate} />
      </div>
      <div style={{ display: tab === 'fiscal' ? 'block' : 'none' }}>
        <Fiscal navigate={navigate} />
      </div>
    </div>
  )
}
