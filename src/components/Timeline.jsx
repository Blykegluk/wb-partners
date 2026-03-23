import { useState } from 'react'
import { Plus, FileText, Calendar, Wrench, AlertTriangle, RefreshCw, Upload, Circle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { fmtDate, fmt } from '../lib/utils'
import { Modal, Field, Sel, Btn } from './UI'

const TYPE_CONFIG = {
  bail_debut: { label: 'Début de bail', color: 'bg-green-500', icon: Calendar },
  bail_fin: { label: 'Fin de bail', color: 'bg-red-500', icon: Calendar },
  revision: { label: 'Révision loyer', color: 'bg-blue-500', icon: RefreshCw },
  document: { label: 'Document', color: 'bg-purple-500', icon: Upload },
  travaux: { label: 'Travaux', color: 'bg-amber-500', icon: Wrench },
  sinistre: { label: 'Sinistre', color: 'bg-red-600', icon: AlertTriangle },
  autre: { label: 'Autre', color: 'bg-gray-500', icon: Circle },
}

const EVENT_TYPES = Object.entries(TYPE_CONFIG).map(([v, c]) => ({ v, l: c.label }))

export default function Timeline({ bienId }) {
  const { baux, locataires, revisions, documents, evenements, selected, canEdit, reload } = useSociete()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ type: 'travaux', date_evenement: '', titre: '', description: '', montant: '' })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-generate events from existing data
  const autoEvents = []

  // Bail events
  baux.filter(b => b.bien_id === bienId).forEach(bail => {
    const loc = locataires.find(l => l.id === bail.locataire_id)
    const locName = loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || 'Locataire'
    if (bail.date_debut) {
      autoEvents.push({
        id: `bail_debut_${bail.id}`,
        type: 'bail_debut',
        date_evenement: bail.date_debut,
        titre: `Début bail — ${locName}`,
        auto: true,
      })
    }
    if (bail.date_fin) {
      autoEvents.push({
        id: `bail_fin_${bail.id}`,
        type: 'bail_fin',
        date_evenement: bail.date_fin,
        titre: `Fin bail — ${locName}`,
        auto: true,
      })
    }
  })

  // Revision events
  const bailIds = baux.filter(b => b.bien_id === bienId).map(b => b.id)
  revisions.filter(r => bailIds.includes(r.bail_id)).forEach(r => {
    autoEvents.push({
      id: `rev_${r.id}`,
      type: 'revision',
      date_evenement: r.date_revision,
      titre: `Révision ${r.indice_type} : ${fmt(r.ancien_loyer)} → ${fmt(r.nouveau_loyer)}`,
      auto: true,
    })
  })

  // Document events
  documents.filter(d => d.bien_id === bienId).forEach(d => {
    autoEvents.push({
      id: `doc_${d.id}`,
      type: 'document',
      date_evenement: d.created_at?.slice(0, 10),
      titre: `Document : ${d.nom}`,
      auto: true,
    })
  })

  // Manual events
  const manualEvents = evenements
    .filter(e => e.bien_id === bienId)
    .map(e => ({ ...e, auto: false }))

  // Merge and sort
  const allEvents = [...autoEvents, ...manualEvents]
    .sort((a, b) => new Date(b.date_evenement) - new Date(a.date_evenement))

  const addEvent = async () => {
    if (!form.titre || !form.date_evenement) return
    setSaving(true)
    await supabase.from('evenements_bien').insert({
      societe_id: selected.id,
      bien_id: bienId,
      type: form.type,
      date_evenement: form.date_evenement,
      titre: form.titre,
      description: form.description || null,
      montant: form.montant ? parseFloat(form.montant) : null,
    })
    setSaving(false)
    setOpen(false)
    setForm({ type: 'travaux', date_evenement: '', titre: '', description: '', montant: '' })
    reload()
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-navy">Historique</h4>
        {canEdit && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 cursor-pointer"
          >
            <Plus size={14} /> Ajouter
          </button>
        )}
      </div>

      {allEvents.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Aucun événement.</p>
      ) : (
        <div className="relative pl-6 border-l-2 border-gray-200 space-y-4">
          {allEvents.map(evt => {
            const config = TYPE_CONFIG[evt.type] || TYPE_CONFIG.autre
            const Icon = config.icon
            return (
              <div key={evt.id} className="relative">
                <div className={`absolute -left-[25px] w-3 h-3 rounded-full ${config.color} border-2 border-white`} />
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{fmtDate(evt.date_evenement)}</span>
                      <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${config.color} text-white`}>
                        {config.label}
                      </span>
                      {evt.auto && <span className="text-[10px] text-gray-300">auto</span>}
                    </div>
                    <p className="text-sm text-navy mt-0.5">{evt.titre}</p>
                    {evt.description && <p className="text-xs text-gray-400 mt-0.5">{evt.description}</p>}
                    {evt.montant && <p className="text-xs font-semibold text-navy mt-0.5">{fmt(evt.montant)}</p>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {open && (
        <Modal title="Ajouter un événement" onClose={() => setOpen(false)}>
          <Sel label="Type" value={form.type} onChange={e => set('type', e.target.value)} options={EVENT_TYPES} />
          <Field label="Date" type="date" value={form.date_evenement} onChange={e => set('date_evenement', e.target.value)} />
          <Field label="Titre" value={form.titre} onChange={e => set('titre', e.target.value)} placeholder="ex: Remplacement toiture" />
          <Field label="Description (optionnel)" value={form.description} onChange={e => set('description', e.target.value)} />
          <Field label="Montant (optionnel)" type="number" value={form.montant} onChange={e => set('montant', e.target.value)} />
          <div className="flex gap-2 mt-4">
            <Btn onClick={addEvent} disabled={!form.titre || !form.date_evenement || saving}>
              {saving ? 'Ajout...' : 'Ajouter'}
            </Btn>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Annuler</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
