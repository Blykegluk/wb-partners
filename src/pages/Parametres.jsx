import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/Auth'
import { useSociete } from '../contexts/Societe'
import { PageHeader, Card, Modal, Field, Sel, Grid2, Btn, Badge, Empty } from '../components/UI'
import { CheckCircle, UserPlus, Trash2, Shield } from 'lucide-react'

const TABS = [
  { key: 'societe', label: 'Société' },
  { key: 'membres', label: 'Membres' },
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
      <div style={{ display: tab === 'membres' ? 'block' : 'none' }}>
        <MembresTab />
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

// ── Membres tab ─────────────────────────────────────────
function MembresTab() {
  const { user } = useAuth()
  const { selected, membres, isAdmin, reload } = useSociete()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const invite = async () => {
    setError('')
    setLoading(true)
    const { data: profiles } = await supabase.from('profiles').select('id, email, full_name').eq('email', email.trim().toLowerCase())
    if (!profiles || profiles.length === 0) {
      setError("Aucun utilisateur trouvé avec cet email. Il doit d'abord se connecter à WB Partners.")
      setLoading(false)
      return
    }
    const target = profiles[0]
    if (membres.find(m => m.user_id === target.id)) { setError('Déjà membre.'); setLoading(false); return }
    if (target.id === selected.owner_id) { setError('Propriétaire de la société.'); setLoading(false); return }

    const { error: e } = await supabase.from('societe_membres').insert({ societe_id: selected.id, user_id: target.id, role })
    if (e) { setError(e.message); setLoading(false); return }
    setOpen(false); setEmail(''); setRole('viewer'); setLoading(false)
    reload()
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

      {membres.length === 0 ? (
        <Empty icon={<UserPlus size={40} />} text="Aucun membre invité." />
      ) : (
        <div className="space-y-2">
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

      {open && (
        <Modal title="Inviter un membre" onClose={() => { setOpen(false); setError('') }}>
          <Field label="Email *" type="email" placeholder="nom@exemple.com" value={email} onChange={e => setEmail(e.target.value)} />
          <Sel label="Rôle" value={role} onChange={e => setRole(e.target.value)}
            options={[
              { v: 'viewer', l: 'Lecteur — consultation uniquement' },
              { v: 'editor', l: 'Éditeur — peut modifier les données' },
              { v: 'admin', l: 'Admin — peut gérer les membres' },
            ]} />
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <Btn variant="ghost" onClick={() => { setOpen(false); setError('') }}>Annuler</Btn>
            <Btn onClick={invite} disabled={loading || !email.trim()}>{loading ? '...' : 'Inviter'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
