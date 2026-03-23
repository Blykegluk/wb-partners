import { useState } from 'react'
import { Users, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { PageHeader, Card, Modal, Field, Grid2, Btn, Empty } from '../components/UI'

const EMPTY = { raison_sociale: '', prenom: '', nom: '', email: '', telephone: '', adresse: '', code_postal: '', ville: '' }

export default function Locataires() {
  const { locataires, selected, canEdit, reload } = useSociete()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(null)
  const [f, setF] = useState(EMPTY)

  const openNew = () => { setEdit(null); setF(EMPTY); setOpen(true) }
  const openEdit = (loc) => { setEdit(loc); setF({ ...EMPTY, ...loc }); setOpen(true) }

  const save = async () => {
    const data = { ...f }
    delete data.id; delete data.created_at; delete data.societe_id
    if (edit) {
      await supabase.from('locataires').update(data).eq('id', edit.id)
    } else {
      await supabase.from('locataires').insert({ ...data, societe_id: selected.id })
    }
    setOpen(false)
    reload()
  }

  const del = async (id) => {
    if (!confirm('Supprimer ce locataire ?')) return
    await supabase.from('locataires').delete().eq('id', id)
    reload()
  }

  const u = (k, v) => setF(p => ({ ...p, [k]: v }))

  return (
    <div>
      <PageHeader title="Locataires" sub="Gérez vos locataires">
        {canEdit && <Btn onClick={openNew}><Plus size={15} /> Ajouter</Btn>}
      </PageHeader>

      {locataires.length === 0 ? (
        <Empty icon={<Users size={40} />} text="Aucun locataire. Ajoutez votre premier locataire." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Locataire', 'Email', 'Téléphone', 'Adresse', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locataires.map(l => (
                <tr key={l.id} className="border-t border-gray-50 hover:bg-gray-50/50 cursor-pointer" onClick={() => canEdit && openEdit(l)}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-navy text-sm">{l.raison_sociale || `${l.prenom} ${l.nom}`}</p>
                    {l.raison_sociale && <p className="text-xs text-gray-400">{l.prenom} {l.nom}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{l.email || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{l.telephone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{l.ville || '—'}</td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <button onClick={e => { e.stopPropagation(); del(l.id) }} className="text-gray-300 hover:text-red-500 cursor-pointer">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {open && (
        <Modal title={edit ? 'Modifier le locataire' : 'Nouveau locataire'} onClose={() => setOpen(false)}>
          <Field label="Raison sociale" placeholder="Nom de la société" value={f.raison_sociale} onChange={e => u('raison_sociale', e.target.value)} />
          <Grid2>
            <Field label="Prénom" value={f.prenom} onChange={e => u('prenom', e.target.value)} />
            <Field label="Nom" value={f.nom} onChange={e => u('nom', e.target.value)} />
          </Grid2>
          <Grid2>
            <Field label="Email" type="email" value={f.email} onChange={e => u('email', e.target.value)} />
            <Field label="Téléphone" value={f.telephone} onChange={e => u('telephone', e.target.value)} />
          </Grid2>
          <Field label="Adresse" value={f.adresse} onChange={e => u('adresse', e.target.value)} />
          <Grid2>
            <Field label="Code postal" value={f.code_postal} onChange={e => u('code_postal', e.target.value)} />
            <Field label="Ville" value={f.ville} onChange={e => u('ville', e.target.value)} />
          </Grid2>
          <div className="flex justify-end gap-3 mt-4">
            <Btn variant="ghost" onClick={() => setOpen(false)}>Annuler</Btn>
            <Btn onClick={save}>{edit ? 'Enregistrer' : 'Ajouter'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
