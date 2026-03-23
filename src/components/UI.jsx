import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

// ── Badge ────────────────────────────────────────────────────

const STATUT_CFG = {
  payé: ['bg-green-100 text-green-700', 'Payé'],
  impayé: ['bg-red-100 text-red-700', 'Impayé'],
  en_attente: ['bg-yellow-100 text-yellow-700', 'En attente'],
  owner: ['bg-blue-100 text-blue-700', 'Propriétaire'],
  admin: ['bg-purple-100 text-purple-700', 'Admin'],
  editor: ['bg-emerald-100 text-emerald-700', 'Éditeur'],
  viewer: ['bg-gray-100 text-gray-500', 'Lecteur'],
}

export function Badge({ value }) {
  const [cls, label] = STATUT_CFG[value] || ['bg-gray-100 text-gray-500', value]
  return <span className={`${cls} px-2.5 py-0.5 rounded-full text-xs font-semibold`}>{label}</span>
}

// ── Button ───────────────────────────────────────────────────

const BTN_VARIANTS = {
  primary: 'bg-navy text-white hover:bg-navy-light',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'bg-transparent text-gray-500 border border-gray-200 hover:bg-gray-50',
  green: 'bg-green-600 text-white hover:bg-green-700',
  orange: 'bg-orange-600 text-white hover:bg-orange-700',
}

export function Btn({ children, variant = 'primary', className = '', ...p }) {
  return (
    <button
      className={`${BTN_VARIANTS[variant] || BTN_VARIANTS.primary} px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
      {...p}
    >
      {children}
    </button>
  )
}

// ── Field ────────────────────────────────────────────────────

export function Field({ label, className = '', ...p }) {
  return (
    <div className={`mb-3 ${className}`}>
      {label && <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">{label}</label>}
      <input
        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none text-gray-800 focus:border-blue-500 transition-colors"
        {...p}
      />
    </div>
  )
}

// ── Select ───────────────────────────────────────────────────

export function Sel({ label, options, className = '', ...p }) {
  return (
    <div className={`mb-3 ${className}`}>
      {label && <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">{label}</label>}
      <select
        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white cursor-pointer"
        {...p}
      >
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )
}

// ── Checkbox ─────────────────────────────────────────────────

export function Check({ label, ...p }) {
  return (
    <label className="flex items-center gap-2 mb-3 cursor-pointer text-sm text-gray-700">
      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-navy" {...p} />
      {label}
    </label>
  )
}

// ── Modal ────────────────────────────────────────────────────

export function Modal({ title, onClose, width = 'max-w-lg', children }) {
  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl p-8 ${width} w-[95vw] max-h-[90vh] overflow-y-auto shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-navy">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────

export function Empty({ icon, text }) {
  return (
    <div className="bg-white rounded-xl p-16 text-center border-2 border-dashed border-gray-200">
      <div className="text-gray-300 mb-3 flex justify-center">{icon}</div>
      <p className="text-gray-400 font-medium">{text}</p>
    </div>
  )
}

// ── Spinner ──────────────────────────────────────────────────

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-16">
      <div className="w-8 h-8 border-3 border-gray-200 border-t-navy rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}

// ── PageHeader ───────────────────────────────────────────────

export function PageHeader({ title, sub, children }) {
  return (
    <div className="flex justify-between items-end mb-8">
      <div>
        <h1 className="text-2xl font-extrabold text-navy mb-0.5">{title}</h1>
        {sub && <p className="text-gray-400 text-sm">{sub}</p>}
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  )
}

// ── Grid helpers ─────────────────────────────────────────────

export function Grid2({ children }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

export function Grid3({ children }) {
  return <div className="grid grid-cols-3 gap-3">{children}</div>
}

// ── Card ─────────────────────────────────────────────────────

export function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-gray-100 shadow-sm ${className}`}>{children}</div>
}

// ── Address autocomplete ─────────────────────────────────────

export function AddressField({ label, value, onChange, onSelect }) {
  const [suggestions, setSuggestions] = useState([])
  const [show, setShow] = useState(false)
  const ref = useRef()

  const search = async (q) => {
    onChange(q)
    if (q.length < 3) { setSuggestions([]); return }
    try {
      const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`)
      const d = await r.json()
      setSuggestions(d.features || [])
      setShow(true)
    } catch { setSuggestions([]) }
  }

  const pick = (f) => {
    const p = f.properties
    onSelect({
      adresse: p.name,
      ville: p.city,
      code_postal: p.postcode,
      latitude: f.geometry.coordinates[1],
      longitude: f.geometry.coordinates[0],
    })
    setSuggestions([])
    setShow(false)
  }

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setShow(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="mb-3 relative" ref={ref}>
      {label && <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">{label}</label>}
      <input
        value={value}
        onChange={e => search(e.target.value)}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none text-gray-800 focus:border-blue-500"
        placeholder="Commencez à taper une adresse..."
        autoComplete="off"
        onFocus={() => { if (suggestions.length > 0) setShow(true) }}
      />
      {show && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {suggestions.map((f, i) => (
            <div
              key={i}
              onMouseDown={() => pick(f)}
              className="px-3 py-2.5 cursor-pointer text-sm text-gray-800 border-b border-gray-50 hover:bg-gray-50 flex items-center gap-2"
            >
              <span className="text-gray-400">📍</span>
              <span><strong>{f.properties.name}</strong> — {f.properties.postcode} {f.properties.city}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
