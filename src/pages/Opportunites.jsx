import { useState, useEffect } from 'react'
import Pipeline from './Pipeline'
import Simulateur from './Simulateur'
import Cibles from './Cibles'

const TABS = [
  { key: 'veille', label: 'Veille' },
  { key: 'cibles', label: 'Cibles de reprise' },
  { key: 'simulateur', label: "Simulateur d'acquisition" },
]

export default function Opportunites({ navigate, navState, setNavState }) {
  const [tab, setTab] = useState('veille')

  useEffect(() => {
    if (navState?.tab && TABS.find(t => t.key === navState.tab)) {
      setTab(navState.tab)
      setNavState?.(null)
    }
  }, [navState, setNavState])

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
      <div style={{ display: tab === 'veille' ? 'block' : 'none' }}>
        <Pipeline navigate={navigate} />
      </div>
      <div style={{ display: tab === 'cibles' ? 'block' : 'none' }}>
        <Cibles navigate={navigate} />
      </div>
      <div style={{ display: tab === 'simulateur' ? 'block' : 'none' }}>
        <Simulateur navigate={navigate} />
      </div>
    </div>
  )
}
