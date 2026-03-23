import {
  Building2, Users, FileText, CreditCard, Settings, LogOut,
  LayoutDashboard, FolderOpen, Calendar, UserPlus, ChevronDown,
  Calculator, Receipt, Wallet, RefreshCw, AlertTriangle, Map,
} from 'lucide-react'
import { useAuth } from '../contexts/Auth'
import { useSociete } from '../contexts/Societe'
import { Badge } from './UI'

const NAV = [
  { k: 'dashboard', l: 'Tableau de bord', I: LayoutDashboard },
  { k: 'biens', l: 'Biens', I: Building2 },
  { k: 'locataires', l: 'Locataires', I: Users },
  { k: 'baux', l: 'Baux', I: FileText },
  { k: 'finances', l: 'Finances', I: Calendar },
  { k: 'transactions', l: 'Transactions', I: CreditCard },
  { k: 'documents', l: 'Coffre-fort', I: FolderOpen },
  { sep: true, l: 'Outils' },
  { k: 'simulateur', l: 'Simulateur', I: Calculator },
  { k: 'fiscal', l: 'Fiscal', I: Receipt },
  { k: 'tresorerie', l: 'Trésorerie', I: Wallet },
  { sep: true, l: 'Gestion' },
  { k: 'revisions', l: 'Révisions loyer', I: RefreshCw },
  { k: 'relances', l: 'Relances', I: AlertTriangle },
  { k: 'carte', l: 'Carte', I: Map },
]

export default function Layout({ page, setPage, children }) {
  const { signOut, user } = useAuth()
  const { selected, selectSociete, societes, role, transactions } = useSociete()

  const impCount = transactions.filter(t => t.statut === 'impayé').length

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-navy-dark flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-6 border-b border-white/10">
          <h1 className="text-white font-black text-lg tracking-[3px]">WB Partners</h1>
          <p className="text-white/40 text-xs mt-0.5">Gestion Immobilière</p>
        </div>

        {/* Société selector */}
        <div className="px-3 py-3 border-b border-white/10">
          <button
            onClick={() => selectSociete(null)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-sm cursor-pointer transition-colors"
          >
            <span className="truncate font-medium">{selected?.nom_affiche || selected?.nom || 'Société'}</span>
            <ChevronDown size={14} className="text-white/40 shrink-0 ml-2" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            if (item.sep) return (
              <p key={item.l} className="text-[10px] uppercase tracking-widest text-white/25 font-bold px-3 pt-4 pb-1">{item.l}</p>
            )
            const { k, l, I } = item
            const active = page === k
            return (
              <button
                key={k}
                onClick={() => setPage(k)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                  active ? 'bg-blue-500/20 text-blue-400 font-semibold' : 'text-white/50 hover:text-white/70 hover:bg-white/5'
                }`}
              >
                <I size={16} />
                {l}
                {k === 'transactions' && impCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{impCount}</span>
                )}
                {k === 'relances' && impCount > 0 && (
                  <span className="ml-auto bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{impCount}</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-4 space-y-1">
          <button
            onClick={() => setPage('membres')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
              page === 'membres' ? 'bg-blue-500/20 text-blue-400' : 'text-white/45 hover:text-white/70 hover:bg-white/5'
            }`}
          >
            <UserPlus size={16} />Membres
          </button>
          <button
            onClick={() => setPage('parametres')}
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
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        {/* Top bar */}
        <div className="flex justify-end items-center gap-3 mb-6">
          <Badge value={role} />
          <div className="flex items-center gap-2">
            {user?.user_metadata?.avatar_url && (
              <img src={user.user_metadata.avatar_url} alt="" className="w-7 h-7 rounded-full" />
            )}
            <span className="text-sm text-gray-500">{user?.user_metadata?.full_name || user?.email}</span>
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}
