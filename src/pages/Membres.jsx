import { useState } from 'react'
import { UserPlus, Trash2, Shield } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/Auth'
import { useSociete } from '../contexts/Societe'
import { PageHeader, Card, Modal, Field, Sel, Btn, Badge, Empty } from '../components/UI'

export default function Membres() {
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

    // Lookup profile by email
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('email', email.trim().toLowerCase())

    if (!profiles || profiles.length === 0) {
      setError("Aucun utilisateur trouvé avec cet email. Il doit d'abord se connecter à WB Partners.")
      setLoading(false)
      return
    }

    const targetUser = profiles[0]

    // Check not already member
    const existing = membres.find(m => m.user_id === targetUser.id)
    if (existing) {
      setError('Cet utilisateur est déjà membre de cette société.')
      setLoading(false)
      return
    }

    // Check not the owner
    if (targetUser.id === selected.owner_id) {
      setError('Cet utilisateur est le propriétaire de la société.')
      setLoading(false)
      return
    }

    await supabase.from('societe_membres').insert({
      societe_id: selected.id,
      user_id: targetUser.id,
      role,
    })

    setOpen(false)
    setEmail('')
    setRole('viewer')
    setLoading(false)
    reload()
  }

  const changeRole = async (membreId, newRole) => {
    await supabase.from('societe_membres').update({ role: newRole }).eq('id', membreId)
    reload()
  }

  const remove = async (membreId) => {
    if (!confirm('Retirer ce membre ?')) return
    await supabase.from('societe_membres').delete().eq('id', membreId)
    reload()
  }

  return (
    <div>
      <PageHeader title="Membres" sub="Gérez les accès à cette société">
        {isAdmin && <Btn onClick={() => setOpen(true)}><UserPlus size={15} /> Inviter</Btn>}
      </PageHeader>

      {/* Owner */}
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

      {/* Members list */}
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
                    <select
                      value={m.role}
                      onChange={e => changeRole(m.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 cursor-pointer"
                    >
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
          <Field
            label="Email *"
            type="email"
            placeholder="nom@exemple.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <Sel
            label="Rôle"
            value={role}
            onChange={e => setRole(e.target.value)}
            options={[
              { v: 'viewer', l: 'Lecteur — consultation uniquement' },
              { v: 'editor', l: 'Éditeur — peut modifier les données' },
              { v: 'admin', l: 'Admin — peut gérer les membres' },
            ]}
          />
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <Btn variant="ghost" onClick={() => { setOpen(false); setError('') }}>Annuler</Btn>
            <Btn onClick={invite} disabled={loading || !email.trim()}>
              {loading ? '...' : 'Inviter'}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
