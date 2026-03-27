import { useState } from 'react'
import Simulateur from './Simulateur'
import Carte from './Carte'
import Revisions from './Revisions'

const TABS = [
  { key: 'simulateur', label: 'Simulateur' },
  { key: 'carte', label: 'Carte' },
  { key: 'revisions', label: 'Révisions loyer' },
]

export default function Outils({ navigate }) {
  const [tab, setTab] = useState('simulateur')

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
      <div style={{ display: tab === 'simulateur' ? 'block' : 'none' }}>
        <Simulateur navigate={navigate} />
      </div>
      <div style={{ display: tab === 'carte' ? 'block' : 'none' }}>
        <Carte navigate={navigate} />
      </div>
      <div style={{ display: tab === 'revisions' ? 'block' : 'none' }}>
        <Revisions navigate={navigate} />
      </div>
    </div>
  )
}
