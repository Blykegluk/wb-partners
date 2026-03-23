import { useState, useEffect } from 'react'
import { FileText, Plus, Trash2, Building2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { fmt, fmtDate } from '../lib/utils'
import { PageHeader, Card, Modal, Field, Sel, Grid2, Grid3, Btn, Badge, Empty } from '../components/UI'

const EMPTY = {
  bien_id: '', locataire_id: '', date_debut: '', date_fin: '',
  loyer_ht: '', loyer_an1: '', loyer_an2: '', charges: '', depot: '',
  type_bail: 'commercial', utilisation: '', indice_revision: 'ILC',
  date_revision_anniversaire: '', actif: true,
}

export default function Baux({ navigate, navState, setNavState }) {
  const { baux, biens, locataires, transactions, selected, canEdit, reload } = useSociete()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(null)
  const [f, setF] = useState(EMPTY)

  // Handle navState: open modal with pre-filled bien_id
  useEffect(() => {
    if (navState?.openNew) {
      setEdit(null)
      setF({ ...EMPTY, bien_id: navState.bien_id || '' })
      setOpen(true)
      setNavState(null)
    }
  }, [navState, setNavState])

  const openNew = () => { setEdit(null); setF(EMPTY); setOpen(true) }
  const openEdit = (b) => { setEdit(b); setF({ ...EMPTY, ...b }); setOpen(true) }
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  const num = (k, v) => u(k, v === '' ? '' : v)

  const save = async () => {
    const data = { ...f }
    for (const k of ['loyer_ht','loyer_an1','loyer_an2','charges','depot']) {
      data[k] = data[k] === '' || data[k] === null ? null : Number(data[k])
    }
    data.actif = Boolean(data.actif)
    delete data.id; delete data.created_at

    if (edit) {
      await supabase.from('baux').update(data).eq('id', edit.id)
    } else {
      await supabase.from('baux').insert({ ...data, societe_id: selected.id })
    }
    setOpen(false)
    reload()
  }

  const del = async (id) => {
    if (!confirm('Supprimer ce bail ?')) return
    await supabase.from('baux').delete().eq('id', id)
    reload()
  }

  return (
    <div>
      <PageHeader title="Baux" sub="Gérez vos contrats de location">
        {canEdit && <Btn onClick={openNew}><Plus size={15} /> Nouveau bail</Btn>}
      </PageHeader>

      {baux.length === 0 ? (
        <Empty icon={<FileText size={40} />} text="Aucun bail." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Bien', 'Locataire', 'Loyer HT', 'Charges', 'Période', 'Type', 'Impayés', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {baux.map(b => {
                const bien = biens.find(x => x.id === b.bien_id)
                const loc = locataires.find(l => l.id === b.locataire_id)
                const nimp = transactions.filter(t => t.bail_id === b.id && t.statut === 'impayé').length
                return (
                  <tr key={b.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <button onClick={() => navigate('biens')} className="font-semibold text-navy text-sm hover:text-blue-600 cursor-pointer flex items-center gap-1">
                        <Building2 size={13} className="text-gray-300" />
                        {bien?.reference || bien?.adresse || '—'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => navigate('locataires')} className="text-sm text-gray-600 hover:text-blue-600 cursor-pointer flex items-center gap-1">
                        <Users size={13} className="text-gray-300" />
                        {loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || '—'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-navy">{fmt(b.loyer_ht)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fmt(b.charges)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {fmtDate(b.date_debut)} → {b.date_fin ? fmtDate(b.date_fin) : '∞'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 capitalize">{b.type_bail}</td>
                    <td className="px-4 py-3">
                      {nimp > 0 && (
                        <button onClick={() => navigate('relances')} className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer hover:bg-red-200">
                          {nimp} impayé{nimp > 1 ? 's' : ''}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {canEdit && <button onClick={() => openEdit(b)} className="text-gray-300 hover:text-blue-500 cursor-pointer text-xs font-medium">Modifier</button>}
                        {canEdit && (
                          <button onClick={() => del(b.id)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {open && (
        <Modal title={edit ? 'Modifier le bail' : 'Nouveau bail'} onClose={() => setOpen(false)} width="max-w-2xl">
          <Grid2>
            <Sel label="Bien *" value={f.bien_id} onChange={e => u('bien_id', e.target.value)}
              options={[{ v: '', l: 'Sélectionner un bien' }, ...biens.map(b => ({ v: b.id, l: b.reference || b.adresse }))]} />
            <div>
              <Sel label="Locataire *" value={f.locataire_id} onChange={e => u('locataire_id', e.target.value)}
                options={[{ v: '', l: 'Sélectionner un locataire' }, ...locataires.map(l => ({ v: l.id, l: l.raison_sociale || `${l.prenom} ${l.nom}` }))]} />
              {locataires.length === 0 && (
                <button onClick={() => navigate('locataires', { openNew: true })} className="text-xs text-blue-500 hover:underline cursor-pointer -mt-1">
                  + Créer un locataire d'abord
                </button>
              )}
            </div>
          </Grid2>

          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 mt-4">Loyers (progressif)</h4>
          <Grid3>
            <Field label="Loyer HT (palier final) *" type="number" value={f.loyer_ht} onChange={e => num('loyer_ht', e.target.value)} />
            <Field label="Loyer An 1" type="number" placeholder="Si progressif" value={f.loyer_an1 || ''} onChange={e => num('loyer_an1', e.target.value)} />
            <Field label="Loyer An 2" type="number" placeholder="Si progressif" value={f.loyer_an2 || ''} onChange={e => num('loyer_an2', e.target.value)} />
          </Grid3>
          <Grid3>
            <Field label="Charges (€/mois)" type="number" value={f.charges} onChange={e => num('charges', e.target.value)} />
            <Field label="Dépôt de garantie (€)" type="number" value={f.depot} onChange={e => num('depot', e.target.value)} />
            <Sel label="Type de bail" value={f.type_bail} onChange={e => u('type_bail', e.target.value)}
              options={[{v:'commercial',l:'Commercial'},{v:'professionnel',l:'Professionnel'},{v:'habitation',l:'Habitation'}]} />
          </Grid3>

          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 mt-4">Dates & révision</h4>
          <Grid3>
            <Field label="Date début" type="date" value={f.date_debut || ''} onChange={e => u('date_debut', e.target.value)} />
            <Field label="Date fin" type="date" value={f.date_fin || ''} onChange={e => u('date_fin', e.target.value)} />
            <Field label="Date révision" type="date" value={f.date_revision_anniversaire || ''} onChange={e => u('date_revision_anniversaire', e.target.value)} />
          </Grid3>
          <Grid2>
            <Sel label="Indice de révision" value={f.indice_revision} onChange={e => u('indice_revision', e.target.value)}
              options={[{v:'ILC',l:'ILC'},{v:'ICC',l:'ICC'},{v:'IRL',l:'IRL'}]} />
            <Field label="Utilisation" placeholder="ex: Restauration" value={f.utilisation} onChange={e => u('utilisation', e.target.value)} />
          </Grid2>

          <div className="flex justify-end gap-3 mt-6">
            <Btn variant="ghost" onClick={() => setOpen(false)}>Annuler</Btn>
            <Btn onClick={save} disabled={!f.bien_id || !f.locataire_id || !f.loyer_ht}>
              {edit ? 'Enregistrer' : 'Créer'}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
