import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/Auth'
import { useSociete } from '../contexts/Societe'
import { PageHeader, Card, Modal, Field, Sel, Grid2, Btn, Badge, Empty } from '../components/UI'
import { CheckCircle, UserPlus, Trash2, Shield, Landmark, RefreshCw, Unlink, Plus, AlertTriangle, Users } from 'lucide-react'

const FUNCTIONS_URL_TOP = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

const TABS = [
  { key: 'societe', label: 'Société' },
  { key: 'actionnariat', label: 'Actionnariat' },
  { key: 'membres', label: 'Membres' },
  { key: 'banque', label: 'Banque' },
]

export default function Parametres() {
  const { user } = useAuth()
  const { selected, membres, isAdmin, reload } = useSociete()
  const [tab, setTab] = useState('societe')

  return (
    <div>
      <PageHeader title="Paramètres" sub="Configuration de la société" />

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${tab === t.key ? 'bg-white text-navy shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: tab === 'societe' ? 'block' : 'none' }}>
        <SocieteTab />
      </div>
      <div style={{ display: tab === 'actionnariat' ? 'block' : 'none' }}>
        <ActionnariatTab />
      </div>
      <div style={{ display: tab === 'membres' ? 'block' : 'none' }}>
        <MembresTab />
      </div>
      <div style={{ display: tab === 'banque' ? 'block' : 'none' }}>
        <BanqueTab />
      </div>
    </div>
  )
}

// ── Société tab ─────────────────────────────────────────
function SocieteTab() {
  const { selected, isAdmin, reload } = useSociete()
  const [f, setF] = useState({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (selected) setF({ ...selected })
  }, [selected])

  const u = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    const { id, _role, created_at, owner_id, ...data } = f
    const { error } = await supabase.from('societe').update(data).eq('id', selected.id)
    if (error) return
    reload()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-bold text-navy">Identité</h3>
        {isAdmin && (
          <Btn onClick={save}>
            {saved ? <><CheckCircle size={15} /> Enregistré</> : 'Enregistrer'}
          </Btn>
        )}
      </div>
      <Grid2>
        <Field label="Nom légal *" value={f.nom || ''} onChange={e => u('nom', e.target.value)} disabled={!isAdmin} />
        <Field label="Nom d'affichage" value={f.nom_affiche || ''} onChange={e => u('nom_affiche', e.target.value)} disabled={!isAdmin} />
      </Grid2>
      <Grid2>
        <Field label="SIRET" value={f.siret || ''} onChange={e => u('siret', e.target.value)} disabled={!isAdmin} />
        <Field label="RCS" value={f.rcs || ''} onChange={e => u('rcs', e.target.value)} disabled={!isAdmin} />
      </Grid2>
      <Grid2>
        <Field label="APE" value={f.ape || ''} onChange={e => u('ape', e.target.value)} disabled={!isAdmin} />
        <Field label="TVA Intracommunautaire" value={f.tva_intracommunautaire || ''} onChange={e => u('tva_intracommunautaire', e.target.value)} disabled={!isAdmin} />
      </Grid2>
      <Field label="Capital" value={f.capital || ''} onChange={e => u('capital', e.target.value)} disabled={!isAdmin} />

      <h3 className="text-sm font-bold text-navy mb-4 mt-8">Contact</h3>
      <Field label="Adresse" value={f.adresse || ''} onChange={e => u('adresse', e.target.value)} disabled={!isAdmin} />
      <Grid2>
        <Field label="Code postal" value={f.code_postal || ''} onChange={e => u('code_postal', e.target.value)} disabled={!isAdmin} />
        <Field label="Ville" value={f.ville || ''} onChange={e => u('ville', e.target.value)} disabled={!isAdmin} />
      </Grid2>
      <Grid2>
        <Field label="Téléphone" value={f.telephone || ''} onChange={e => u('telephone', e.target.value)} disabled={!isAdmin} />
        <Field label="Email" type="email" value={f.email || ''} onChange={e => u('email', e.target.value)} disabled={!isAdmin} />
      </Grid2>

      <h3 className="text-sm font-bold text-navy mb-4 mt-8">Coordonnées bancaires</h3>
      <Field label="IBAN" value={f.iban || ''} onChange={e => u('iban', e.target.value)} disabled={!isAdmin} />
      <Grid2>
        <Field label="BIC" value={f.bic || ''} onChange={e => u('bic', e.target.value)} disabled={!isAdmin} />
        <Field label="Nom de la banque" value={f.nom_banque || ''} onChange={e => u('nom_banque', e.target.value)} disabled={!isAdmin} />
      </Grid2>
      <Field label="Adresse de la banque" value={f.adresse_banque || ''} onChange={e => u('adresse_banque', e.target.value)} disabled={!isAdmin} />
    </Card>
  )
}

// ── Actionnariat tab ────────────────────────────────────
function ActionnariatTab() {
  const { selected, actionnaires, isAdmin, reload } = useSociete()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [f, setF] = useState({ nom: '', type: 'physique', siret: '', pourcentage: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const total = actionnaires.reduce((s, a) => s + Number(a.pourcentage || 0), 0)
  const totalRounded = Math.round(total * 100) / 100
  const isComplete = Math.abs(total - 100) < 0.01
  const isOver = total > 100.01

  const openAdd = () => {
    setEditing(null)
    setF({ nom: '', type: 'physique', siret: '', pourcentage: '', notes: '' })
    setError('')
    setOpen(true)
  }

  const openEdit = (a) => {
    setEditing(a)
    setF({
      nom: a.nom || '',
      type: a.type || 'physique',
      siret: a.siret || '',
      pourcentage: a.pourcentage ?? '',
      notes: a.notes || '',
    })
    setError('')
    setOpen(true)
  }

  const save = async () => {
    setError('')
    if (!f.nom.trim()) { setError('Le nom est requis.'); return }
    const pct = Number(f.pourcentage)
    if (isNaN(pct) || pct < 0 || pct > 100) { setError('Le pourcentage doit être entre 0 et 100.'); return }

    setSaving(true)
    const payload = {
      societe_id: selected.id,
      nom: f.nom.trim(),
      type: f.type,
      siret: f.siret.trim() || null,
      pourcentage: pct,
      notes: f.notes.trim() || null,
    }

    const { error: e } = editing
      ? await supabase.from('actionnaires').update(payload).eq('id', editing.id)
      : await supabase.from('actionnaires').insert(payload)

    setSaving(false)
    if (e) { setError(e.message); return }
    setOpen(false)
    reload()
  }

  const del = async (a) => {
    if (!confirm(`Supprimer l'actionnaire « ${a.nom} » ?`)) return
    await supabase.from('actionnaires').delete().eq('id', a.id)
    reload()
  }

  return (
    <div>
      <Card className="p-6 mb-4">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-bold text-navy">Répartition du capital</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Total des participations enregistrées
            </p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${isComplete ? 'text-emerald-600' : isOver ? 'text-red-500' : 'text-amber-500'}`}>
              {totalRounded.toFixed(2).replace('.', ',')}%
            </p>
            <p className={`text-xs font-semibold ${isComplete ? 'text-emerald-600' : isOver ? 'text-red-500' : 'text-amber-500'}`}>
              {isComplete ? 'Capital complet' : isOver ? 'Dépasse 100%' : `Reste ${(100 - totalRounded).toFixed(2).replace('.', ',')}%`}
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
          <div
            className={`h-full transition-all ${isComplete ? 'bg-emerald-500' : isOver ? 'bg-red-500' : 'bg-amber-400'}`}
            style={{ width: `${Math.min(total, 100)}%` }}
          />
        </div>
        {!isComplete && !isOver && actionnaires.length > 0 && (
          <div className="flex items-center gap-2 mt-3 text-xs text-amber-600">
            <AlertTriangle size={14} />
            La somme des participations doit atteindre 100%.
          </div>
        )}
        {isOver && (
          <div className="flex items-center gap-2 mt-3 text-xs text-red-500">
            <AlertTriangle size={14} />
            La somme dépasse 100% : corrigez une ou plusieurs participations.
          </div>
        )}
      </Card>

      {isAdmin && (
        <div className="flex justify-end mb-4">
          <Btn onClick={openAdd}><Plus size={15} /> Ajouter un actionnaire</Btn>
        </div>
      )}

      {actionnaires.length === 0 ? (
        <Empty icon={<Users size={40} />} text="Aucun actionnaire enregistré." />
      ) : (
        <div className="space-y-2">
          {actionnaires.map(a => (
            <Card key={a.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-navy/5 flex items-center justify-center flex-shrink-0">
                    <Users size={16} className="text-navy" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-navy text-sm truncate">{a.nom}</p>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                        {a.type === 'morale' ? 'Personne morale' : 'Personne physique'}
                      </span>
                    </div>
                    {a.siret && <p className="text-xs text-gray-400">SIRET : {a.siret}</p>}
                    {a.notes && <p className="text-xs text-gray-400 italic mt-0.5">{a.notes}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <p className="text-lg font-bold text-navy">{Number(a.pourcentage).toFixed(2).replace('.', ',')}%</p>
                  {isAdmin && (
                    <>
                      <button onClick={() => openEdit(a)}
                        className="text-xs font-semibold px-2 py-1 rounded-lg hover:bg-gray-100 text-blue-500 cursor-pointer">
                        Modifier
                      </button>
                      <button onClick={() => del(a)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {open && (
        <Modal title={editing ? 'Modifier l\'actionnaire' : 'Ajouter un actionnaire'} onClose={() => setOpen(false)}>
          <Field label="Nom / Raison sociale *" value={f.nom}
            onChange={e => setF(p => ({ ...p, nom: e.target.value }))}
            placeholder="ex: Anthony Bouskila ou SCI Hoche" />
          <Sel label="Type *" value={f.type}
            onChange={e => setF(p => ({ ...p, type: e.target.value }))}
            options={[
              { v: 'physique', l: 'Personne physique' },
              { v: 'morale', l: 'Personne morale' },
            ]} />
          {f.type === 'morale' && (
            <Field label="SIRET" value={f.siret}
              onChange={e => setF(p => ({ ...p, siret: e.target.value }))} />
          )}
          <Field label="Participation (%) *" type="number" step="0.01" min="0" max="100"
            value={f.pourcentage}
            onChange={e => setF(p => ({ ...p, pourcentage: e.target.value }))} />
          <Field label="Notes" value={f.notes}
            onChange={e => setF(p => ({ ...p, notes: e.target.value }))}
            placeholder="ex: usufruit, nu-propriété, gérant..." />
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <Btn variant="ghost" onClick={() => setOpen(false)}>Annuler</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Membres tab ─────────────────────────────────────────
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

function MembresTab() {
  const { user } = useAuth()
  const { selected, membres, isAdmin, reload } = useSociete()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [invitations, setInvitations] = useState([])

  // Load pending invitations
  useEffect(() => {
    if (selected) {
      supabase.from('invitations').select('*').eq('societe_id', selected.id).then(({ data }) => setInvitations(data || []))
    }
  }, [selected, membres])

  const invite = async () => {
    setError('')
    setSuccess('')
    setLoading(true)
    const trimmedEmail = email.trim().toLowerCase()

    // Everything handled server-side (no profiles query = no permission error)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${FUNCTIONS_URL_TOP}/send-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        email: trimmedEmail,
        societe_id: selected.id,
        societe_name: selected.nom_affiche || selected.nom,
        invited_by_name: user.user_metadata?.full_name || user.email,
        invited_by_id: user.id,
        role,
      }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Erreur'); setLoading(false); return }

    if (result.action === 'added_directly') {
      setSuccess(`${trimmedEmail} ajouté comme membre.`)
      reload()
    } else if (result.action === 'already_member') {
      setError('Déjà membre de cette société.')
    } else {
      setSuccess(`Invitation envoyée à ${trimmedEmail}`)
      const { data: inv } = await supabase.from('invitations').select('*').eq('societe_id', selected.id)
      setInvitations(inv || [])
    }
    setLoading(false)
  }

  const cancelInvite = async (id) => {
    await supabase.from('invitations').delete().eq('id', id)
    setInvitations(prev => prev.filter(i => i.id !== id))
  }

  const changeRole = async (id, newRole) => {
    await supabase.from('societe_membres').update({ role: newRole }).eq('id', id)
    reload()
  }

  const remove = async (id) => {
    if (!confirm('Retirer ce membre ?')) return
    await supabase.from('societe_membres').delete().eq('id', id)
    reload()
  }

  return (
    <div>
      {isAdmin && (
        <div className="flex justify-end mb-4">
          <Btn onClick={() => setOpen(true)}><UserPlus size={15} /> Inviter</Btn>
        </div>
      )}

      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-navy flex items-center justify-center">
              <Shield size={16} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-navy text-sm">Propriétaire</p>
              <p className="text-xs text-gray-400">{selected?.owner_id === user?.id ? 'Vous' : selected?.owner_id}</p>
            </div>
          </div>
          <Badge value="owner" />
        </div>
      </Card>

      {/* Active members */}
      {membres.length > 0 && (
        <div className="space-y-2 mb-4">
          {membres.map(m => (
            <Card key={m.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {m.profiles?.avatar_url ? (
                    <img src={m.profiles.avatar_url} className="w-9 h-9 rounded-full" alt="" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold">
                      {(m.profiles?.full_name || m.profiles?.email || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-navy text-sm">{m.profiles?.full_name || m.profiles?.email}</p>
                    <p className="text-xs text-gray-400">{m.profiles?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isAdmin ? (
                    <select value={m.role} onChange={e => changeRole(m.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 cursor-pointer">
                      <option value="admin">Admin</option>
                      <option value="editor">Éditeur</option>
                      <option value="viewer">Lecteur</option>
                    </select>
                  ) : (
                    <Badge value={m.role} />
                  )}
                  {isAdmin && (
                    <button onClick={() => remove(m.id)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 mt-6">Invitations en attente</p>
          <div className="space-y-2 mb-4">
            {invitations.map(inv => (
              <Card key={inv.id} className="p-4 border-dashed border-amber-200 bg-amber-50/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-bold">
                      {inv.email[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-navy text-sm">{inv.email}</p>
                      <p className="text-xs text-amber-600">Invitation envoyée</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold capitalize">{inv.role}</span>
                    {isAdmin && (
                      <button onClick={() => cancelInvite(inv.id)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {membres.length === 0 && invitations.length === 0 && (
        <Empty icon={<UserPlus size={40} />} text="Aucun membre invité." />
      )}

      {open && (
        <Modal title="Inviter un membre" onClose={() => { setOpen(false); setError(''); setSuccess('') }}>
          <Field label="Email *" type="email" placeholder="nom@exemple.com" value={email} onChange={e => setEmail(e.target.value)} />
          <Sel label="Rôle" value={role} onChange={e => setRole(e.target.value)}
            options={[
              { v: 'viewer', l: 'Lecteur — consultation uniquement' },
              { v: 'editor', l: 'Éditeur — peut modifier les données' },
              { v: 'admin', l: 'Admin — peut gérer les membres' },
            ]} />
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          {success && <p className="text-emerald-600 text-sm mb-3 font-medium">{success}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <Btn variant="ghost" onClick={() => { setOpen(false); setError(''); setSuccess('') }}>Fermer</Btn>
            <Btn onClick={invite} disabled={loading || !email.trim()}>{loading ? 'Envoi...' : 'Inviter'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Banque tab ──────────────────────────────────────────
function BanqueTab() {
  const { user } = useAuth()
  const { selected, isAdmin } = useSociete()
  const [conn, setConn] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (selected) {
      supabase.from('bank_connections').select('*').eq('societe_id', selected.id).single()
        .then(({ data }) => { setConn(data); setLoading(false) })
    }
  }, [selected])

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  const connectBank = async () => {
    setError('')
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${FUNCTIONS_URL_TOP}/bank-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          societe_id: selected.id,
          callback_url: window.location.origin + window.location.pathname,
          user_email: user?.email || '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Redirect to Bridge Connect widget (user selects bank there)
      window.location.href = data.url
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  const checkCallback = async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const res = await fetch(`${FUNCTIONS_URL_TOP}/bank-callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ societe_id: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.status === 'connected') {
        setConn(prev => ({ ...prev, ...data, status: 'connected' }))
      } else {
        setError(data.message || 'Connexion en attente.')
      }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const syncTransactions = async () => {
    setSyncing(true)
    setSyncResult(null)
    setError('')
    try {
      const token = await getToken()
      const res = await fetch(`${FUNCTIONS_URL_TOP}/bank-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ societe_id: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSyncResult(data)
      setConn(prev => ({ ...prev, last_sync: new Date().toISOString() }))
    } catch (e) { setError(e.message) }
    setSyncing(false)
  }

  const disconnect = async () => {
    if (!confirm('Déconnecter le compte bancaire ?')) return
    await supabase.from('bank_connections').delete().eq('societe_id', selected.id)
    setConn(null)
    setSyncResult(null)
  }

  if (loading && !conn) return <Card className="p-8 text-center"><p className="text-gray-400 text-sm">Chargement...</p></Card>

  // Connected state
  if (conn?.status === 'connected') {
    return (
      <div>
        <Card className="p-6 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Landmark size={24} className="text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-navy">{conn.institution_name || 'Banque connectée'}</p>
                <p className="text-xs text-gray-400">
                  Compte connecté
                  {conn.last_sync && <> · Dernière sync : {new Date(conn.last_sync).toLocaleDateString('fr-FR')} {new Date(conn.last_sync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Btn onClick={syncTransactions} disabled={syncing}>
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Synchronisation...' : 'Synchroniser'}
              </Btn>
              {isAdmin && (
                <Btn variant="ghost" onClick={disconnect}><Unlink size={14} /> Déconnecter</Btn>
              )}
            </div>
          </div>
        </Card>

        {syncResult && (
          <Card className="p-6 border-emerald-200">
            <h4 className="text-sm font-bold text-navy mb-3">Résultat de la synchronisation</h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-blue-600">{syncResult.bank_transactions}</p>
                <p className="text-xs text-gray-400">Transactions bancaires</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-emerald-600">{syncResult.matched}</p>
                <p className="text-xs text-gray-400">Loyers matchés</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-amber-600">{(syncResult.total_pending || 0) - syncResult.matched}</p>
                <p className="text-xs text-gray-400">En attente</p>
              </div>
            </div>
            {syncResult.details?.length > 0 && (
              <div className="mt-4 space-y-1">
                {syncResult.details.map((d, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 px-3 bg-emerald-50 rounded text-sm">
                    <span className="text-emerald-700 font-medium">{d.amount}€ — {d.date}</span>
                    <span className="text-emerald-500 text-xs">Ref: {d.bank_ref}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
      </div>
    )
  }

  // Pending state (waiting for bank auth callback)
  if (conn?.status === 'pending') {
    return (
      <Card className="p-8 text-center">
        <Landmark size={40} className="text-amber-400 mx-auto mb-4" />
        <p className="font-semibold text-navy mb-2">Autorisation en attente</p>
        <p className="text-sm text-gray-400 mb-4">Vous avez initié une connexion bancaire. Si vous avez autorisé l'accès, cliquez ci-dessous.</p>
        <Btn onClick={checkCallback}>Vérifier la connexion</Btn>
        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
      </Card>
    )
  }

  // Not connected
  return (
    <Card className="p-8">
      <div className="text-center mb-6">
        <Landmark size={40} className="text-gray-300 mx-auto mb-4" />
        <p className="font-semibold text-navy mb-1">Connecter un compte bancaire</p>
        <p className="text-sm text-gray-400 max-w-md mx-auto">Vérifiez automatiquement si les loyers sont perçus en connectant le compte bancaire de la société. Vous choisirez votre banque à l'étape suivante.</p>
      </div>

      <div className="max-w-md mx-auto text-center">
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <Btn onClick={connectBank} disabled={loading} className="justify-center">
          <Landmark size={15} /> {loading ? 'Connexion...' : 'Connecter ma banque'}
        </Btn>
        <p className="text-xs text-gray-300 mt-4">Connexion sécurisée via Bridge (Open Banking / DSP2). Vos identifiants bancaires ne sont jamais stockés sur nos serveurs.</p>
      </div>
    </Card>
  )
}
