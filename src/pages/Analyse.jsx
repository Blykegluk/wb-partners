import { useState, useEffect } from 'react'
import Tresorerie from './Tresorerie'
import Previsionnel from './Previsionnel'
import Fiscal from './Fiscal'
import FichePatrimoniale from './FichePatrimoniale'

const TABS = [
  { key: 'tresorerie', label: 'Trésorerie' },
  { key: 'previsionnel', label: 'Prévisionnel' },
  { key: 'fiscal', label: 'Fiscal' },
  { key: 'fiche', label: 'Fiche patrimoniale' },
]

export default function Analyse({ navigate, navState, setNavState }) {
  const [tab, setTab] = useState('tresorerie')

  // Permet d'atterrir directement sur un onglet depuis un lien profond
  // (ex. navigate('analyse', { tab: 'fiche' })).
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
      <div style={{ display: tab === 'tresorerie' ? 'block' : 'none' }}>
        <Tresorerie navigate={navigate} />
      </div>
      <div style={{ display: tab === 'previsionnel' ? 'block' : 'none' }}>
        <Previsionnel navigate={navigate} />
      </div>
      <div style={{ display: tab === 'fiscal' ? 'block' : 'none' }}>
        <Fiscal navigate={navigate} />
      </div>
      <div style={{ display: tab === 'fiche' ? 'block' : 'none' }}>
        <FichePatrimoniale />
      </div>
    </div>
  )
}
