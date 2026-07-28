import { useRef, useState } from 'react'
import {
  LayoutDashboard, Building2, ArrowLeftRight, BarChart3, Radar,
  Settings, LogOut, ChevronDown, Sparkles, Menu, X,
} from 'lucide-react'
import { useAuth } from '../contexts/Auth'
import { useSociete } from '../contexts/Societe'
import logoUrl from '../assets/logo.png'

const NAV = [
  { k: 'apercu',       l: 'Aperçu',           I: LayoutDashboard },
  { k: 'patrimoine',   l: 'Patrimoine',       I: Building2 },
  { k: 'flux',         l: 'Flux financiers',  I: ArrowLeftRight, badgeKind: 'impayes' },
  { k: 'analyse',      l: 'Analyse',          I: BarChart3 },
  { k: 'opportunites', l: 'Opportunités',     I: Radar,          badgeKind: 'veille' },
]

export default function Layout({ page, setPage, onDropFile, children }) {
  const { signOut, user } = useAuth()
  const { selected, selectSociete, transactions } = useSociete()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef()

  const impCount = transactions.filter(t => t.statut === 'impayé').length

  const navigate = (k) => { setPage(k); setMobileOpen(false) }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f && onDropFile) onDropFile(f)
  }

  const handleFilePick = (e) => {
    const f = e.target.files?.[0]
    if (f && onDropFile) onDropFile(f)
    e.target.value = ''
  }

  const displayName = user?.user_metadata?.full_name || user?.email || 'Utilisateur'
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0].toUpperCase())
    .join('') || 'U'

  const SidebarContent = () => (
    <>
      {/* Header: logo + société selector */}
      <div className="px-2 pb-5 pt-1 flex items-center gap-2.5">
        <img src={logoUrl} alt="WB Partners" className="w-10 h-10 rounded-[10px] shrink-0 object-cover" />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[14px] font-bold text-navy tracking-[0.5px] leading-tight">WB PARTNERS</p>
          <button
            onClick={() => { selectSociete(null); setMobileOpen(false) }}
            className="mt-0.5 p-0 border-none bg-transparent text-[11px] text-[color:var(--color-text-faint)] cursor-pointer inline-flex items-center gap-1 hover:text-[color:var(--color-text-muted)] transition-colors max-w-full"
          >
            <span className="truncate">{selected?.nom_affiche || selected?.nom || 'Aucune société'}</span>
            <ChevronDown size={10} className="shrink-0" />
          </button>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-[color:var(--color-text-faint)] cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ k, l, I, badgeKind }) => {
          const active = page === k
          const badgeValue = badgeKind === 'impayes' ? impCount : 0
          const badgeColor = badgeKind === 'impayes' ? 'red' : 'green'
          return (
            <button
              key={k}
              onClick={() => navigate(k)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[14px] cursor-pointer transition-colors ${
                active
                  ? 'bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] font-semibold'
                  : 'text-[color:var(--color-text-muted)] hover:bg-[#f5f7fa]'
              }`}
            >
              <I size={16} className={active ? 'text-[color:var(--color-brand)]' : 'text-[color:var(--color-text-faint)]'} />
              <span className="flex-1 text-left">{l}</span>
              {badgeValue > 0 && (
                <span
                  className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                    badgeColor === 'red'
                      ? 'bg-[color:var(--color-negative-fill)] text-[color:var(--color-negative)]'
                      : 'bg-[color:var(--color-positive-soft)] text-[color:var(--color-positive)]'
                  }`}
                >
                  {badgeValue}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* IA Inbox card */}
      <div
        className="mt-6 rounded-[14px] p-4"
        style={{ background: 'linear-gradient(160deg,#16294a,#243b63)' }}
      >
        <p className="m-0 mb-1 text-[12px] font-semibold text-white/85 flex items-center gap-1.5">
          <Sparkles size={13} className="text-[#9db8ec]" />
          Boîte d'arrivée
        </p>
        <p className="m-0 mb-3 text-[12px] text-white/55 leading-[1.5]">
          Déposez n'importe quel document, l'IA s'occupe du reste.
        </p>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-[1.5px] border-dashed rounded-[10px] px-3 py-3.5 text-center text-[12px] cursor-pointer transition-colors ${
            dragOver
              ? 'bg-white/10 border-white/50 text-white'
              : 'border-white/30 text-white/70 hover:bg-white/[0.06]'
          }`}
        >
          {dragOver ? 'Déposez ici' : 'Glisser un fichier ici'}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={handleFilePick}
        />
      </div>

      {/* Bottom: settings + logout */}
      <div className="mt-auto flex flex-col gap-0.5">
        <button
          onClick={() => navigate('parametres')}
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[14px] cursor-pointer transition-colors ${
            page === 'parametres'
              ? 'bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] font-semibold'
              : 'text-[color:var(--color-text-faint)] hover:bg-[#f5f7fa] hover:text-[color:var(--color-text-muted)]'
          }`}
        >
          <Settings size={16} />
          Réglages
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[14px] cursor-pointer transition-colors text-[color:var(--color-text-faint)] hover:bg-[#f5f7fa] hover:text-[color:var(--color-text-muted)]"
        >
          <LogOut size={16} />
          Déconnexion
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-[color:var(--color-bg)]">
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col bg-white border-r border-[color:var(--color-card-border)] shrink-0 sticky top-0 h-screen"
        style={{ width: 232, padding: '24px 16px' }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside
            className="relative bg-white flex flex-col h-full z-10 border-r border-[color:var(--color-card-border)]"
            style={{ width: 260, padding: '24px 16px' }}
          >
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {/* Mobile top bar (hamburger + avatar) */}
        <div className="lg:hidden flex justify-between items-center px-5 pt-4 pb-2">
          <button onClick={() => setMobileOpen(true)} className="text-[color:var(--color-navy)] cursor-pointer">
            <Menu size={22} />
          </button>
          <div className="w-9 h-9 rounded-full bg-[color:var(--color-navy)] text-white text-[13px] font-bold flex items-center justify-center">
            {initials}
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}
