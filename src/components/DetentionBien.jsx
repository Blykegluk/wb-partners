import { useState } from 'react'
import { Users, Plus, Trash2, AlertTriangle, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { Card, Modal, Field, Sel, Btn } from './UI'

// Valeur spéciale du menu déroulant pour saisir un détenteur libre.
const AUTRE = '__autre__'

const EMPTY = { source: '', nom_externe: '', pourcentage: '', notes: '' }

/**
 * Détention d'un bien.
 *
 * Par défaut un bien est réputé détenu à 100 % par la société courante.
 * Dès qu'une ligne est ajoutée, la répartition devient explicite : chaque
 * ligne pointe soit un actionnaire déjà enregistré sur la société, soit un
 * détenteur externe saisi librement. Le reliquat (100 % − somme des lignes)
 * est présenté comme restant détenu par la société.
 */
export default function DetentionBien({ bien }) {
  const { selected, actionnaires, bienActionnaires, canEdit, reload } = useSociete()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [f, setF] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const lignes = bienActionnaires.filter(x => x.bien_id === bien.id)

  const totalTiers = lignes.reduce((s, x) => s + Number(x.pourcentage || 0), 0)
  const totalRounded = Math.round(totalTiers * 100) / 100
  const partSociete = Math.round((100 - totalTiers) * 100) / 100
  const isOver = totalTiers > 100.01

  const societeNom = selected?.nom_affiche || selected?.nom || 'La société'

  const labelOf = (ligne) => {
    if (ligne.actionnaire_id) {
      const a = actionnaires.find(x => x.id === ligne.actionnaire_id)
      return a?.nom || 'Actionnaire supprimé'
    }
    return ligne.nom_externe
  }

  const openAdd = () => {
    setEditing(null)
    setF(EMPTY)
    setError('')
    setOpen(true)
  }

  const openEdit = (ligne) => {
    setEditing(ligne)
    setF({
      source: ligne.actionnaire_id || AUTRE,
      nom_externe: ligne.nom_externe || '',
      pourcentage: ligne.pourcentage ?? '',
      notes: ligne.notes || '',
    })
    setError('')
    setOpen(true)
  }

  const save = async () => {
    setError('')
    if (!f.source) { setError('Sélectionnez un détenteur.') ; return }
    if (f.source === AUTRE && !f.nom_externe.trim()) {
      setError('Précisez le nom du détenteur.')
      return
    }
    const pct = Number(f.pourcentage)
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      setError('Le pourcentage doit être compris entre 0 et 100.')
      return
    }

    // Empêche de dépasser 100 % en cumulé (hors ligne en cours d'édition).
    const autresLignes = lignes.filter(x => x.id !== editing?.id)
    const cumul = autresLignes.reduce((s, x) => s + Number(x.pourcentage || 0), 0) + pct
    if (cumul > 100.01) {
      setError(`Total supérieur à 100 % (${cumul.toFixed(2).replace('.', ',')} %). Réduisez cette part.`)
      return
    }

    setSaving(true)
    const payload = {
      societe_id: selected.id,
      bien_id: bien.id,
      actionnaire_id: f.source === AUTRE ? null : f.source,
      nom_externe: f.source === AUTRE ? f.nom_externe.trim() : null,
      pourcentage: pct,
      notes: f.notes.trim() || null,
    }

    const { error: e } = editing
      ? await supabase.from('bien_actionnaires').update(payload).eq('id', editing.id)
      : await supabase.from('bien_actionnaires').insert(payload)

    setSaving(false)
    if (e) { setError(e.message); return }
    setOpen(false)
    reload()
  }

  const del = async (ligne) => {
    if (!confirm(`Retirer « ${labelOf(ligne)} » de la détention de ce bien ?`)) return
    const { error: e } = await supabase.from('bien_actionnaires').delete().eq('id', ligne.id)
    if (e) { alert(e.message); return }
    reload()
  }

  // Actionnaires déjà utilisés (hors ligne en édition) → non re-sélectionnables.
  const dejaUtilises = lignes
    .filter(x => x.id !== editing?.id && x.actionnaire_id)
    .map(x => x.actionnaire_id)

  const optionsSource = [
    { v: '', l: 'Sélectionner un détenteur' },
    ...actionnaires
      .filter(a => !dejaUtilises.includes(a.id))
      .map(a => ({ v: a.id, l: `${a.nom} (${Number(a.pourcentage).toFixed(2).replace('.', ',')} % de la société)` })),
    { v: AUTRE, l: 'Autre — préciser…' },
  ]

  return (
    <Card className="p-6 mt-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-bold text-navy uppercase tracking-wide">Détention du bien</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Répartition de la propriété entre la société et d'éventuels co-détenteurs
          </p>
        </div>
        {canEdit && (
          <Btn className="!text-xs !px-3 !py-1.5" onClick={openAdd}>
            <Plus size={13} /> Ajouter un détenteur
          </Btn>
        )}
      </div>

      {lignes.length === 0 ? (
        <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3.5">
          <div className="w-9 h-9 rounded-full bg-navy/5 flex items-center justify-center flex-shrink-0">
            <Building2 size={15} className="text-navy" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-navy truncate">{societeNom}</p>
            <p className="text-xs text-gray-400">Détention pleine et entière</p>
          </div>
          <p className="text-lg font-bold text-navy flex-shrink-0">100,00 %</p>
        </div>
      ) : (
        <>
          {/* Barre de répartition */}
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-3 flex">
            {partSociete > 0 && (
              <div className="h-full bg-navy" style={{ width: `${Math.max(0, partSociete)}%` }} />
            )}
            {lignes.map((l, i) => (
              <div
                key={l.id}
                className={i % 2 === 0 ? 'h-full bg-blue-400' : 'h-full bg-blue-300'}
                style={{ width: `${Math.min(100, Number(l.pourcentage))}%` }}
              />
            ))}
          </div>

          <div className="space-y-2">
            {/* Part société (reliquat) */}
            {partSociete > 0.001 && (
              <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-navy/5 flex items-center justify-center flex-shrink-0">
                  <Building2 size={15} className="text-navy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy truncate">{societeNom}</p>
                  <p className="text-xs text-gray-400">Part restante de la société</p>
                </div>
                <p className="text-lg font-bold text-navy flex-shrink-0">
                  {partSociete.toFixed(2).replace('.', ',')} %
                </p>
              </div>
            )}

            {/* Co-détenteurs */}
            {lignes.map(l => (
              <div key={l.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Users size={15} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-navy truncate">{labelOf(l)}</p>
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">
                      {l.actionnaire_id ? 'Actionnaire' : 'Externe'}
                    </span>
                  </div>
                  {l.notes && <p className="text-xs text-gray-400 italic mt-0.5 truncate">{l.notes}</p>}
                </div>
                <p className="text-lg font-bold text-navy flex-shrink-0">
                  {Number(l.pourcentage).toFixed(2).replace('.', ',')} %
                </p>
                {canEdit && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => openEdit(l)}
                      className="text-xs font-semibold px-2 py-1 rounded-lg hover:bg-gray-100 text-blue-500 cursor-pointer"
                    >
                      Modifier
                    </button>
                    <button onClick={() => del(l)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {isOver && (
            <div className="flex items-center gap-2 mt-3 text-xs text-red-500">
              <AlertTriangle size={14} />
              La somme des parts dépasse 100 % ({totalRounded.toFixed(2).replace('.', ',')} %).
            </div>
          )}
        </>
      )}

      {open && (
        <Modal
          title={editing ? 'Modifier la détention' : 'Ajouter un détenteur'}
          onClose={() => setOpen(false)}
        >
          <Sel
            label="Détenteur *"
            value={f.source}
            onChange={e => setF(p => ({ ...p, source: e.target.value }))}
            options={optionsSource}
          />
          {f.source === AUTRE && (
            <Field
              label="Nom du détenteur *"
              value={f.nom_externe}
              onChange={e => setF(p => ({ ...p, nom_externe: e.target.value }))}
              placeholder="ex: SCI Martin ou Jean Dupont"
            />
          )}
          <Field
            label="Part de détention du bien (%) *"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={f.pourcentage}
            onChange={e => setF(p => ({ ...p, pourcentage: e.target.value }))}
            placeholder="ex: 50"
          />
          <Field
            label="Notes"
            value={f.notes}
            onChange={e => setF(p => ({ ...p, notes: e.target.value }))}
            placeholder="ex: indivision, usufruit, apport en nature..."
          />
          <p className="text-xs text-gray-400 mb-3">
            Le solde non attribué reste détenu par {societeNom}.
          </p>
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <Btn variant="ghost" onClick={() => setOpen(false)}>Annuler</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Btn>
          </div>
        </Modal>
      )}
    </Card>
  )
}
