import { useState } from 'react'
import {
  Building2, Settings, LogOut, LayoutDashboard, ChevronDown,
  Calculator, CreditCard, BarChart3, Menu, X, Radar,
} from 'lucide-react'
import { useAuth } from '../contexts/Auth'
import { useSociete } from '../contexts/Societe'
import { Badge } from './UI'
import logoUrl from '../assets/logo.png'

const NAV = [
  { k: 'dashboard', l: 'Tableau de bord', I: LayoutDashboard },
  { k: 'patrimoine', l: 'Biens', I: Building2 },
  { k: 'finances', l: 'Finances', I: CreditCard },
  { k: 'analyse', l: 'Analyse', I: BarChart3 },
  { k: 'pipeline', l: 'Pipeline', I: Radar },
  { k: 'outils', l: 'Outils', I: Calculator },
]

export default function Layout({ page, setPage, children }) {
  const { signOut, user } = useAuth()
  const { selected, selectSociete, role, transactions } = useSociete()
  const [mobileOpen, setMobileOpen] = useState(false)

  const impCount = transactions.filter(t => t.statut === 'impayé').length

  const navigate = (k) => { setPage(k); setMobileOpen(false) }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="WB Partners" className="w-16 h-16 rounded-2xl" />
          <div>
            <h1 className="text-white font-black text-base tracking-[2px]">WB Partners</h1>
            <p className="text-white/40 text-[10px]">Gestion Immobilière</p>
          </div>
        </div>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-white/50 cursor-pointer">
          <X size={20} />
        </button>
      </div>

      {/* Société selector */}
      <div className="px-3 py-3 border-b border-white/10">
        <button
          onClick={() => { selectSociete(null); setMobileOpen(false) }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-sm cursor-pointer transition-colors"
        >
          <span className="truncate font-medium">{selected?.nom_affiche || selected?.nom || 'Société'}</span>
          <ChevronDown size={14} className="text-white/40 shrink-0 ml-2" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ k, l, I }) => {
          const active = page === k
          return (
            <button
              key={k}
              onClick={() => navigate(k)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${
                active ? 'bg-blue-500/20 text-blue-400 font-semibold' : 'text-white/50 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <I size={16} />
              {l}
              {k === 'finances' && impCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{impCount}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-1">
        <button
          onClick={() => navigate('parametres')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
            page === 'parametres' ? 'bg-blue-500/20 text-blue-400' : 'text-white/45 hover:text-white/70 hover:bg-white/5'
          }`}
        >
          <Settings size={16} />Paramètres
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/30 hover:text-red-400 cursor-pointer transition-colors"
        >
          <LogOut size={16} />Déconnexion
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 bg-navy-dark flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-full bg-navy-dark flex flex-col z-10">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {/* Top bar */}
        <div className="flex justify-between items-center gap-3 mb-6">
          {/* Mobile hamburger */}
          <button onClick={() => setMobileOpen(true)} className="lg:hidden text-navy cursor-pointer">
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-3 ml-auto">
            <Badge value={role} />
            <div className="flex items-center gap-2">
              {user?.user_metadata?.avatar_url && (
                <img src={user.user_metadata.avatar_url} alt="" className="w-7 h-7 rounded-full" />
              )}
              <span className="text-sm text-gray-500 hidden sm:inline">{user?.user_metadata?.full_name || user?.email}</span>
            </div>
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}
