import { useState, useRef, useEffect } from 'react'
import { FolderOpen, Upload, Download, Trash2, File, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { fmtSize, DOC_TYPES } from '../lib/utils'
import { PageHeader, Card, Modal, Field, Sel, Btn, Empty } from '../components/UI'

export default function Documents({ navigate, navState, setNavState }) {
  const { biens, documents, selected, canEdit, reload } = useSociete()
  const [filterBien, setFilterBien] = useState('')
  const [filterType, setFilterType] = useState('')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ bien_id: '', type: 'bail', nom: '' })
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef()

  // Handle navState: open modal with pre-filled bien_id
  useEffect(() => {
    if (navState?.openNew) {
      setF({ bien_id: navState.bien_id || '', type: 'bail', nom: '' })
      setFile(null)
      setOpen(true)
      setNavState(null)
    }
  }, [navState, setNavState])

  const filtered = documents.filter(d =>
    (!filterBien || d.bien_id === filterBien) && (!filterType || d.type === filterType)
  )

  const handleUpload = async () => {
    if (!file || !f.bien_id || !f.nom) return
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop()
    const path = `${user.id}/${f.bien_id}/${f.type}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
    if (!upErr) {
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
      await supabase.from('documents').insert({
        societe_id: selected.id, bien_id: f.bien_id, type: f.type,
        nom: f.nom, fichier_url: publicUrl, taille: file.size,
      })
      reload()
      setOpen(false)
      setF({ bien_id: '', type: 'bail', nom: '' })
      setFile(null)
    }
    setUploading(false)
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) {
      setFile(dropped)
      if (!f.nom) setF(p => ({ ...p, nom: dropped.name.replace(/\.[^/.]+$/, '') }))
    }
  }

  const del = async (doc) => {
    if (!confirm('Supprimer ce document ?')) return
    const urlParts = doc.fichier_url?.split('/object/public/documents/')
    if (urlParts?.[1]) await supabase.storage.from('documents').remove([urlParts[1]])
    await supabase.from('documents').delete().eq('id', doc.id)
    reload()
  }

  const typeInfo = (type) => DOC_TYPES.find(t => t.v === type) || { l: type, color: '#64748b' }

  return (
    <div>
      <PageHeader title="Coffre-fort" sub="Baux, factures et documents juridiques">
        {canEdit && <Btn onClick={() => setOpen(true)}><Upload size={15} /> Ajouter</Btn>}
      </PageHeader>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select value={filterBien} onChange={e => setFilterBien(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white cursor-pointer">
          <option value="">Tous les biens</option>
          {biens.map(b => <option key={b.id} value={b.id}>{b.reference || b.adresse}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white cursor-pointer">
          <option value="">Tous les types</option>
          {DOC_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        {(filterBien || filterType) && (
          <button onClick={() => { setFilterBien(''); setFilterType('') }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-400 cursor-pointer hover:bg-gray-50">
            ✕ Effacer
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty icon={<FolderOpen size={40} />} text="Aucun document." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Document', 'Bien', 'Type', 'Taille', 'Date', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const bien = biens.find(b => b.id === d.bien_id)
                const ti = typeInfo(d.type)
                return (
                  <tr key={d.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="bg-gray-100 rounded-lg p-2"><File size={16} className="text-gray-500" /></div>
                        <span className="font-semibold text-navy text-sm">{d.nom}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => navigate('biens')} className="text-sm text-gray-500 hover:text-blue-600 cursor-pointer flex items-center gap-1">
                        <Building2 size={13} className="text-gray-300" />
                        {bien?.reference || bien?.adresse?.slice(0, 22) || '—'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: ti.color + '18', color: ti.color }}>
                        {ti.l}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{fmtSize(d.taille)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <a href={d.fichier_url} target="_blank" rel="noreferrer"
                          className="bg-blue-50 text-blue-600 rounded-lg px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1 no-underline hover:bg-blue-100">
                          <Download size={12} /> Ouvrir
                        </a>
                        {canEdit && (
                          <button onClick={() => del(d)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                            <Trash2 size={14} />
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

      {/* Upload Modal */}
      {open && (
        <Modal title="Ajouter un document" onClose={() => { setOpen(false); setFile(null) }}>
          <Sel label="Bien *" value={f.bien_id} onChange={e => setF(p => ({ ...p, bien_id: e.target.value }))}
            options={[{ v: '', l: 'Sélectionner un bien' }, ...biens.map(b => ({ v: b.id, l: `${b.reference ? b.reference + ' — ' : ''}${b.adresse}` }))]} />
          <Sel label="Type *" value={f.type} onChange={e => setF(p => ({ ...p, type: e.target.value }))}
            options={DOC_TYPES.map(t => ({ v: t.v, l: t.l }))} />
          <Field label="Nom *" placeholder="ex: Bail Délice Royal 2025" value={f.nom} onChange={e => setF(p => ({ ...p, nom: e.target.value }))} />

          <div
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current.click()}
            className={`border-2 border-dashed ${drag ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'} rounded-xl p-7 text-center cursor-pointer mb-4 transition-colors`}
          >
            {file ? (
              <div>
                <p className="font-semibold text-navy mb-1">{file.name}</p>
                <p className="text-xs text-gray-400">{fmtSize(file.size)}</p>
              </div>
            ) : (
              <div>
                <Upload size={24} className="text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 font-medium text-sm">Glissez un fichier ici</p>
                <p className="text-xs text-gray-400 mt-1">PDF, image, Excel</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" className="hidden"
              onChange={e => { const picked = e.target.files[0]; if (picked) { setFile(picked); if (!f.nom) setF(p => ({ ...p, nom: picked.name.replace(/\.[^/.]+$/, '') })) } }} />
          </div>

          <div className="flex justify-end gap-3">
            <Btn variant="ghost" onClick={() => { setOpen(false); setFile(null) }}>Annuler</Btn>
            <Btn onClick={handleUpload} disabled={uploading || !file || !f.bien_id || !f.nom}>
              {uploading ? 'Envoi...' : 'Enregistrer'}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
