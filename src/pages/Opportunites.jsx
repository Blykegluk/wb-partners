import { useState, useEffect, useRef } from 'react'
import { ShoppingCart, Building2 } from 'lucide-react'
import Pipeline from './Pipeline'
import Simulateur from './Simulateur'
import Cibles from './Cibles'

// Deux univers, deux métiers : trouver un SUPERMARCHÉ à reprendre ou à
// implanter (R3 annonces, R5 BODACC, cibles à démarcher), et investir dans
// l'IMMOBILIER (R1 murs, R2 hôtelier, R4 neuf, simulateur de crédit).
// Chaque univers garde ses sous-onglets ; tout lit les mêmes tables — la
// séparation est purement de présentation.
const SECTIONS = {
  supermarches: {
    label: 'Supermarchés',
    I: ShoppingCart,
    tabs: [
      { key: 'veille', label: 'Veille — annonces & BODACC' },
      { key: 'cibles', label: 'Cibles de reprise' },
    ],
  },
  immobilier: {
    label: 'Immobilier',
    I: Building2,
    tabs: [
      { key: 'veille', label: 'Veille' },
      { key: 'simulateur', label: "Simulateur d'acquisition" },
    ],
  },
}

// L'utilisateur retrouve l'univers où il travaillait la dernière fois.
const loadSection = () => {
  try {
    const v = localStorage.getItem('wb_opp_section')
    return SECTIONS[v] ? v : 'supermarches'
  } catch { return 'supermarches' }
}

export default function Opportunites({ navigate, navState, setNavState }) {
  const [section, setSection] = useState(loadSection)
  const [tabs, setTabs] = useState({ supermarches: 'veille', immobilier: 'veille' })

  // Liens profonds : navigate('opportunites', { section, tab }) — et
  // compatibilité avec les anciennes clés ({tab:'simulateur'|'cibles'|'veille'}).
  useEffect(() => {
    if (!navState) return
    let sec = SECTIONS[navState.section] ? navState.section : null
    const tab = navState.tab || null
    if (!sec && tab === 'cibles') sec = 'supermarches'
    if (!sec && tab === 'simulateur') sec = 'immobilier'
    if (sec) {
      setSection(sec)
      if (tab && SECTIONS[sec].tabs.some(t => t.key === tab)) setTabs(t => ({ ...t, [sec]: tab }))
    }
    setNavState?.(null)
  }, [navState, setNavState])

  const choisir = (sec) => {
    setSection(sec)
    try { localStorage.setItem('wb_opp_section', sec) } catch { /* stockage indisponible : sans gravité */ }
  }

  // Monter chaque écran à la première visite puis le garder vivant
  // (display:none) : les données, filtres et tris survivent aux allers-retours.
  const mounted = useRef(new Set())
  const actif = `${section}:${tabs[section]}`
  if (!mounted.current.has(actif)) mounted.current.add(actif)

  const ECRANS = {
    'supermarches:veille': () => (
      <Pipeline navigate={navigate} recherches={['R3', 'R5']}
        titre="Veille supermarchés"
        sousTitre="Locaux à reprendre ou à implanter : annonces (R3) et procédures collectives BODACC (R5)" />
    ),
    'supermarches:cibles': () => <Cibles navigate={navigate} />,
    'immobilier:veille': () => (
      <Pipeline navigate={navigate} recherches={['R1', 'R2', 'R4']}
        titre="Veille immobilière"
        sousTitre="Murs commerciaux (R1), conversion hôtelière (R2), neuf en banlieue (R4)" />
    ),
    'immobilier:simulateur': () => <Simulateur navigate={navigate} />,
  }

  return (
    <div>
      {/* Niveau 1 : l'univers */}
      <div className="flex gap-1 mb-3 bg-gray-100 rounded-xl p-1 w-fit">
        {Object.entries(SECTIONS).map(([k, { label, I }]) => (
          <button key={k} onClick={() => choisir(k)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer inline-flex items-center gap-2 transition-colors ${
              section === k ? 'bg-white text-navy shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}>
            <I size={15} />{label}
          </button>
        ))}
      </div>

      {/* Niveau 2 : les sous-onglets de l'univers */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {SECTIONS[section].tabs.map(t => (
          <button key={t.key} onClick={() => setTabs(prev => ({ ...prev, [section]: t.key }))}
            className={`px-3.5 py-1.5 rounded-full text-sm font-semibold cursor-pointer whitespace-nowrap transition-colors ${
              tabs[section] === t.key ? 'bg-navy text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {[...mounted.current].map(key => (
        <div key={key} style={{ display: key === actif ? 'block' : 'none' }}>
          {ECRANS[key]?.()}
        </div>
      ))}
    </div>
  )
}
