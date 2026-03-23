import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'

const SocieteContext = createContext()

export function SocieteProvider({ children }) {
  const { user } = useAuth()
  const [societes, setSocietes] = useState([])
  const [selected, setSelected] = useState(null)
  const [role, setRole] = useState(null)
  const [loadingSocietes, setLoadingSocietes] = useState(true)

  // Data scoped to selected société
  const [biens, setBiens] = useState([])
  const [locataires, setLocataires] = useState([])
  const [baux, setBaux] = useState([])
  const [transactions, setTransactions] = useState([])
  const [documents, setDocuments] = useState([])
  const [membres, setMembres] = useState([])
  const [revisions, setRevisions] = useState([])
  const [evenements, setEvenements] = useState([])
  const [loadingData, setLoadingData] = useState(false)

  // Load sociétés list
  const loadSocietes = useCallback(async () => {
    if (!user) return
    setLoadingSocietes(true)

    // Owned
    const { data: owned } = await supabase
      .from('societe')
      .select('*')
      .eq('owner_id', user.id)

    // Member of
    const { data: memberships } = await supabase
      .from('societe_membres')
      .select('societe_id, role, societe(*)')
      .eq('user_id', user.id)

    const all = [
      ...(owned || []).map(s => ({ ...s, _role: 'owner' })),
      ...(memberships || []).map(m => ({ ...m.societe, _role: m.role })),
    ]

    // Deduplicate by id
    const map = new Map()
    all.forEach(s => { if (!map.has(s.id)) map.set(s.id, s) })
    setSocietes(Array.from(map.values()))
    setLoadingSocietes(false)
  }, [user])

  useEffect(() => { loadSocietes() }, [loadSocietes])

  // Select a société
  const selectSociete = useCallback((soc) => {
    setSelected(soc)
    setRole(soc?._role || null)
  }, [])

  // Load all data for selected société
  const reload = useCallback(async () => {
    if (!selected) return
    setLoadingData(true)
    const sid = selected.id

    const [b, l, ba, d, m, rev, evt] = await Promise.all([
      supabase.from('biens').select('*').eq('societe_id', sid).order('created_at'),
      supabase.from('locataires').select('*').eq('societe_id', sid).order('created_at'),
      supabase.from('baux').select('*').eq('societe_id', sid).order('created_at'),
      supabase.from('documents').select('*').eq('societe_id', sid).order('created_at', { ascending: false }),
      supabase.from('societe_membres').select('*, profiles(*)').eq('societe_id', sid),
      supabase.from('revisions_loyer').select('*').eq('societe_id', sid).order('date_revision', { ascending: false }),
      supabase.from('evenements_bien').select('*').eq('societe_id', sid).order('date_evenement', { ascending: false }),
    ])

    setBiens(b.data || [])
    setLocataires(l.data || [])
    setBaux(ba.data || [])
    setDocuments(d.data || [])
    setMembres(m.data || [])
    setRevisions(rev.data || [])
    setEvenements(evt.data || [])

    // Transactions via baux ids
    const bauxIds = (ba.data || []).map(x => x.id)
    if (bauxIds.length > 0) {
      const { data: txs } = await supabase
        .from('transactions')
        .select('*')
        .in('bail_id', bauxIds)
        .order('annee', { ascending: false })
        .order('mois', { ascending: false })
      setTransactions(txs || [])
    } else {
      setTransactions([])
    }

    setLoadingData(false)
  }, [selected])

  useEffect(() => { reload() }, [reload])

  const canEdit = role === 'owner' || role === 'admin' || role === 'editor'
  const isAdmin = role === 'owner' || role === 'admin'

  return (
    <SocieteContext.Provider value={{
      societes, loadingSocietes, loadSocietes,
      selected, selectSociete, role, canEdit, isAdmin,
      biens, locataires, baux, transactions, documents, membres, revisions, evenements,
      loadingData, reload,
    }}>
      {children}
    </SocieteContext.Provider>
  )
}

export const useSociete = () => useContext(SocieteContext)
