import { useState } from 'react'
import { Building2, Plus, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/Auth'
import { useSociete } from '../contexts/Societe'
import { Badge, Modal, Field, Btn, Spinner } from '../components/UI'

export default function SelectSociete() {
  const { signOut, user } = useAuth()
  const { societes, loadingSocietes, loadSocietes, selectSociete } = useSociete()
  const [open, setOpen] = useState(false)
  const [nom, setNom] = useState('')
  const [creating, setCreating] = useState(false)

  const create = async () => {
    if (!nom.trim()) return
    setCreating(true)
    await supabase.from('societe').insert({ nom: nom.trim(), owner_id: user.id })
    setNom('')
    setOpen(false)
    setCreating(false)
    await loadSocietes()
  }

  if (loadingSocietes) return <Spinner />

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <div className="bg-navy w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Building2 size={26} color="#fff" />
          </div>
          <h1 className="text-xl font-black text-navy tracking-[3px]">WB Partners</h1>
          <p className="text-gray-400 text-sm mt-2">Sélectionnez une société</p>
        </div>

        <div className="space-y-3 mb-6">
          {societes.map(s => (
            <button
              key={s.id}
              onClick={() => selectSociete(s)}
              className="w-full bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:border-blue-300 hover:shadow-md cursor-pointer transition-all flex items-center justify-between text-left"
            >
              <div>
                <p className="font-bold text-navy text-base">{s.nom_affiche || s.nom}</p>
                {s.siret && <p className="text-gray-400 text-xs mt-0.5">SIRET : {s.siret}</p>}
              </div>
              <Badge value={s._role} />
            </button>
          ))}

          {societes.length === 0 && (
            <div className="bg-white rounded-xl p-10 text-center border-2 border-dashed border-gray-200">
              <p className="text-gray-400 mb-4">Aucune société. Créez votre première société pour commencer.</p>
            </div>
          )}
        </div>

        <div className="flex justify-center gap-3">
          <Btn onClick={() => setOpen(true)}>
            <Plus size={16} /> Nouvelle société
          </Btn>
          <Btn variant="ghost" onClick={signOut}>
            <LogOut size={16} /> Déconnexion
          </Btn>
        </div>
      </div>

      {open && (
        <Modal title="Nouvelle société" onClose={() => setOpen(false)}>
          <Field
            label="Nom de la société *"
            placeholder="ex: SCI Mon Patrimoine"
            value={nom}
            onChange={e => setNom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
          />
          <div className="flex justify-end gap-3 mt-4">
            <Btn variant="ghost" onClick={() => setOpen(false)}>Annuler</Btn>
            <Btn onClick={create} disabled={creating || !nom.trim()}>
              {creating ? '...' : 'Créer'}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
