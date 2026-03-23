import { useState, useEffect } from 'react'
import { Users, Plus, Trash2, FileText, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { fmt, fmtDate } from '../lib/utils'
import { PageHeader, Card, Modal, Field, Grid2, Btn, Empty } from '../components/UI'

const EMPTY = { raison_sociale: '', prenom: '', nom: '', email: '', telephone: '', adresse: '', code_postal: '', ville: '' }

export default function Locataires({ navigate, navState, setNavState }) {
  const { locataires, baux, biens, selected, canEdit, reload } = useSociete()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(null)
  const [f, setF] = useState(EMPTY)
  const [detail, setDetail] = useState(null)

  // Handle navState: open new locataire modal
  useEffect(() => {
    if (navState?.openNew) {
      setEdit(null)
      setF(EMPTY)
      setOpen(true)
      setNavState(null)
    }
  }, [navState, setNavState])

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

  const getLocBaux = (locId) => baux.filter(b => b.locataire_id === locId)

  return (
    <div>
      <PageHeader title="Locataires" sub="Gérez vos locataires">
        {canEdit && <Btn onClick={openNew}><Plus size={15} /> Ajouter</Btn>}
      </PageHeader>

      {locataires.length === 0 ? (
        <Empty icon={<Users size={40} />} text="Aucun locataire. Ajoutez votre premier locataire." />
      ) : (
        <div className="space-y-3">
          {locataires.map(l => {
            const locBaux = getLocBaux(l.id)
            const isOpen = detail?.id === l.id
            return (
              <Card key={l.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => setDetail(isOpen ? null : l)}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center text-purple-500 text-sm font-bold">
                        {(l.raison_sociale || l.prenom || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-navy text-sm">{l.raison_sociale || `${l.prenom} ${l.nom}`}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          {l.email && <span>{l.email}</span>}
                          {l.telephone && <span>{l.telephone}</span>}
                          {l.ville && <span>{l.ville}</span>}
                          <span className="text-[11px] bg-gray-50 px-2 py-0.5 rounded-full">
                            {locBaux.filter(b => b.actif).length} bail{locBaux.filter(b => b.actif).length > 1 ? 'x' : ''} actif{locBaux.filter(b => b.actif).length > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {canEdit && <button onClick={() => openEdit(l)} className="text-gray-300 hover:text-blue-500 cursor-pointer text-xs font-medium">Modifier</button>}
                    {canEdit && (
                      <button onClick={() => del(l.id)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Detail expandable: show baux */}
                {isOpen && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                        <FileText size={13} /> Baux ({locBaux.length})
                      </h4>
                      {canEdit && (
                        <button onClick={() => navigate('baux', { openNew: true })}
                          className="text-xs text-blue-500 hover:text-blue-700 font-semibold cursor-pointer flex items-center gap-1">
                          <Plus size={12} /> Nouveau bail
                        </button>
                      )}
                    </div>
                    {locBaux.length === 0 ? (
                      <p className="text-sm text-gray-300 italic">Aucun bail pour ce locataire</p>
                    ) : (
                      <div className="space-y-2">
                        {locBaux.map(ba => {
                          const bien = biens.find(b => b.id === ba.bien_id)
                          return (
                            <div key={ba.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                              <div className="flex items-center gap-2">
                                <button onClick={() => navigate('biens')} className="text-sm font-semibold text-navy hover:text-blue-600 cursor-pointer">
                                  {bien?.reference || bien?.adresse || '—'}
                                </button>
                                <span className="text-[11px] text-gray-400">
                                  {fmtDate(ba.date_debut)} → {ba.date_fin ? fmtDate(ba.date_fin) : '∞'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-navy">{fmt(ba.loyer_ht)}/mois</span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ba.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                                  {ba.actif ? 'Actif' : 'Inactif'}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {/* Contact details */}
                    {(l.adresse || l.code_postal || l.email || l.telephone) && (
                      <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-sm">
                        {l.adresse && <div><span className="text-xs text-gray-400">Adresse</span><p className="text-navy">{l.adresse}, {l.code_postal} {l.ville}</p></div>}
                        {l.email && <div><span className="text-xs text-gray-400">Email</span><p className="text-navy">{l.email}</p></div>}
                        {l.telephone && <div><span className="text-xs text-gray-400">Téléphone</span><p className="text-navy">{l.telephone}</p></div>}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
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
