import { useState } from 'react'
import { Users, Plus, Trash2, AlertTriangle, Building2, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { Card, Modal, Field, Sel, Btn } from './UI'

// Valeur spéciale du menu déroulant : créer une fiche à la volée.
const NOUVEAU = '__nouveau__'

const arrondi = (n) => Math.round(n * 100) / 100
const pctTxt = (n) => Number(n).toFixed(2).replace('.', ',')

/**
 * Détention d'un bien.
 *
 * Modèle : la société détient le solde non attribué aux tiers. Un bien sans
 * ligne est donc détenu à 100 % par elle ; à l'inverse, des lignes totalisant
 * 100 % ramènent sa part à zéro (bien porté intégralement par des tiers).
 *
 * L'édition se fait sur la répartition entière plutôt que ligne par ligne :
 * on voit la part de la société évoluer en direct et le total est contrôlé
 * avant enregistrement.
 */
export default function DetentionBien({ bien }) {
  const { selected, personnes, actionnaires, bienActionnaires, canEdit, reload } = useSociete()

  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const lignes = bienActionnaires.filter(x => x.bien_id === bien.id)

  const totalTiers = lignes.reduce((s, x) => s + Number(x.pourcentage || 0), 0)
  const partSocietePct = arrondi(100 - totalTiers)
  const isOver = totalTiers > 100.01

  const societeNom = selected?.nom_affiche || selected?.nom || 'La société'

  const personneOf = (l) => personnes.find(p => p.id === l.personne_id) || null

  const labelOf = (l) => {
    const p = personneOf(l)
    if (p) return p.nom
    // Lignes historiques, antérieures à l'annuaire partagé.
    if (l.nom_externe) return l.nom_externe
    return actionnaires.find(a => a.id === l.actionnaire_id)?.nom || 'Détenteur supprimé'
  }

  const estActionnaire = (personneId) =>
    actionnaires.some(a => a.personne_id === personneId)

  // ── Ouverture de l'éditeur ──────────────────────────────
  const openEditor = () => {
    setRows(lignes.map(l => ({
      id: l.id,                       // null pour une nouvelle ligne
      personne_id: l.personne_id || '',
      nom_nouveau: '',
      type_nouveau: 'physique',
      pourcentage: String(l.pourcentage ?? ''),
      notes: l.notes || '',
      _legacy: !l.personne_id,        // ligne héritée sans personne rattachée
      _label: labelOf(l),
    })))
    setError('')
    setOpen(true)
  }

  const addRow = () => setRows(r => [...r, {
    id: null, personne_id: '', nom_nouveau: '', type_nouveau: 'physique',
    pourcentage: '', notes: '', _legacy: false, _label: '',
  }])

  const updateRow = (i, patch) =>
    setRows(r => r.map((row, j) => (j === i ? { ...row, ...patch } : row)))

  const removeRow = (i) => setRows(r => r.filter((_, j) => j !== i))

  const totalSaisi = rows.reduce((s, r) => s + (parseFloat(r.pourcentage) || 0), 0)
  const partSocieteEdit = arrondi(100 - totalSaisi)
  const editOver = totalSaisi > 100.01

  // ── Enregistrement de la répartition complète ───────────
  const save = async () => {
    setError('')

    for (const [i, r] of rows.entries()) {
      if (!r.personne_id && !r._legacy) {
        setError(`Ligne ${i + 1} : sélectionnez un détenteur.`)
        return
      }
      if (r.personne_id === NOUVEAU && !r.nom_nouveau.trim()) {
        setError(`Ligne ${i + 1} : indiquez le nom du nouveau détenteur.`)
        return
      }
      const pct = parseFloat(r.pourcentage)
      if (isNaN(pct) || pct <= 0 || pct > 100) {
        setError(`Ligne ${i + 1} : le pourcentage doit être compris entre 0 et 100.`)
        return
      }
    }

    if (editOver) {
      setError(`Le total des parts atteint ${pctTxt(totalSaisi)} % : il ne peut pas dépasser 100 %.`)
      return
    }

    // Deux lignes ne peuvent pas viser la même personne.
    const ids = rows.map(r => r.personne_id).filter(x => x && x !== NOUVEAU)
    if (new Set(ids).size !== ids.length) {
      setError('Un même détenteur apparaît sur plusieurs lignes. Regroupez sa part.')
      return
    }

    setSaving(true)

    // 1. Créer les fiches demandées à la volée.
    const { data: { user } } = await supabase.auth.getUser()
    const resolved = []
    for (const r of rows) {
      let pid = r.personne_id
      if (pid === NOUVEAU) {
        const { data: np, error: pe } = await supabase.from('personnes').insert({
          created_by: user.id,
          nom: r.nom_nouveau.trim(),
          type: r.type_nouveau,
        }).select().single()
        if (pe) { setError(pe.message); setSaving(false); return }
        pid = np.id
      }
      resolved.push({ ...r, personne_id: pid || null })
    }

    // 2. Supprimer les lignes retirées de la répartition.
    const gardees = resolved.filter(r => r.id).map(r => r.id)
    const aSupprimer = lignes.filter(l => !gardees.includes(l.id)).map(l => l.id)
    if (aSupprimer.length > 0) {
      const { error: de } = await supabase.from('bien_actionnaires').delete().in('id', aSupprimer)
      if (de) { setError(de.message); setSaving(false); return }
    }

    // 3. Créer ou mettre à jour les lignes conservées.
    for (const r of resolved) {
      const payload = {
        societe_id: selected.id,
        bien_id: bien.id,
        pourcentage: parseFloat(r.pourcentage),
        notes: r.notes.trim() || null,
      }
      // On ne réécrit l'identité que si une personne est rattachée : cela
      // préserve les lignes héritées qui ne portent qu'un nom_externe.
      if (r.personne_id) {
        payload.personne_id = r.personne_id
        payload.actionnaire_id = null
        payload.nom_externe = null
      }
      const { error: ue } = r.id
        ? await supabase.from('bien_actionnaires').update(payload).eq('id', r.id)
        : await supabase.from('bien_actionnaires').insert(payload)
      if (ue) { setError(ue.message); setSaving(false); return }
    }

    setSaving(false)
    setOpen(false)
    reload()
  }

  // Options du menu, en excluant les personnes déjà présentes sur d'autres lignes.
  const optionsFor = (i) => {
    const prises = rows.filter((_, j) => j !== i).map(r => r.personne_id).filter(Boolean)
    return [
      { v: '', l: 'Sélectionner un détenteur' },
      ...personnes
        .filter(p => !prises.includes(p.id))
        .map(p => ({
          v: p.id,
          l: estActionnaire(p.id) ? `${p.nom} — actionnaire ${societeNom}` : p.nom,
        })),
      { v: NOUVEAU, l: '➕ Nouveau détenteur…' },
    ]
  }

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
          <Btn className="!text-xs !px-3 !py-1.5" onClick={openEditor}>
            {lignes.length === 0
              ? <><Plus size={13} /> Définir la répartition</>
              : <><Pencil size={13} /> Modifier la répartition</>}
          </Btn>
        )}
      </div>

      {/* Barre de répartition */}
      {lignes.length > 0 && (
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-3 flex">
          {partSocietePct > 0 && (
            <div className="h-full bg-navy" style={{ width: `${Math.max(0, partSocietePct)}%` }} />
          )}
          {lignes.map((l, i) => (
            <div key={l.id}
              className={i % 2 === 0 ? 'h-full bg-blue-400' : 'h-full bg-blue-300'}
              style={{ width: `${Math.min(100, Number(l.pourcentage))}%` }} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {/* Part de la société — masquée si elle est nulle */}
        {partSocietePct > 0.001 && (
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-navy/5 flex items-center justify-center flex-shrink-0">
              <Building2 size={15} className="text-navy" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-navy truncate">{societeNom}</p>
              <p className="text-xs text-gray-400">
                {lignes.length === 0 ? 'Détention pleine et entière' : 'Part restante de la société'}
              </p>
            </div>
            <p className="text-lg font-bold text-navy flex-shrink-0">{pctTxt(partSocietePct)} %</p>
          </div>
        )}

        {/* Co-détenteurs */}
        {lignes.map(l => {
          const p = personneOf(l)
          return (
            <div key={l.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Users size={15} className="text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-navy truncate">{labelOf(l)}</p>
                  {l.personne_id && estActionnaire(l.personne_id) && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 flex-shrink-0">
                      Actionnaire
                    </span>
                  )}
                </div>
                {p?.email && <p className="text-xs text-gray-400 truncate">{p.email}</p>}
                {l.notes && <p className="text-xs text-gray-400 italic mt-0.5 truncate">{l.notes}</p>}
              </div>
              <p className="text-lg font-bold text-navy flex-shrink-0">{pctTxt(l.pourcentage)} %</p>
            </div>
          )
        })}

        {partSocietePct <= 0.001 && lignes.length > 0 && (
          <p className="text-xs text-gray-400 italic pl-1">
            {societeNom} ne détient aucune part de ce bien : il est intégralement porté par les co-détenteurs ci-dessus.
          </p>
        )}
      </div>

      {isOver && (
        <div className="flex items-center gap-2 mt-3 text-xs text-red-500">
          <AlertTriangle size={14} />
          La somme des parts dépasse 100 % ({pctTxt(totalTiers)} %).
        </div>
      )}

      {/* ── Éditeur de répartition ───────────────────────── */}
      {open && (
        <Modal title="Répartition de la détention" onClose={() => setOpen(false)} width="max-w-2xl">
          <p className="text-xs text-gray-400 mb-4">
            Indiquez les parts détenues par des tiers. Le solde revient automatiquement à{' '}
            <strong className="text-navy">{societeNom}</strong>. Pour un bien entièrement porté
            par des tiers, faites atteindre 100 % au total.
          </p>

          {/* Part société, en direct */}
          <div className={`flex items-center justify-between rounded-lg px-4 py-3 mb-3 ${
            editOver ? 'bg-red-50' : 'bg-gray-50'
          }`}>
            <div className="flex items-center gap-3 min-w-0">
              <Building2 size={15} className="text-navy flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy truncate">{societeNom}</p>
                <p className="text-xs text-gray-400">Solde calculé automatiquement</p>
              </div>
            </div>
            <p className={`text-lg font-bold flex-shrink-0 ${editOver ? 'text-red-500' : 'text-navy'}`}>
              {pctTxt(Math.max(0, partSocieteEdit))} %
            </p>
          </div>

          {/* Lignes de co-détention */}
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {r._legacy ? (
                      <div className="mb-3">
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">
                          Détenteur
                        </label>
                        <p className="text-sm text-navy py-2">{r._label} <span className="text-xs text-gray-400">(fiche non rattachée)</span></p>
                      </div>
                    ) : (
                      <Sel
                        label={`Détenteur ${i + 1}`}
                        value={r.personne_id}
                        onChange={e => updateRow(i, { personne_id: e.target.value })}
                        options={optionsFor(i)}
                      />
                    )}
                    {r.personne_id === NOUVEAU && (
                      <>
                        <Field label="Nom / Raison sociale *" value={r.nom_nouveau}
                          onChange={e => updateRow(i, { nom_nouveau: e.target.value })}
                          placeholder="ex: SCI Martin ou Jean Dupont" />
                        <Sel label="Type" value={r.type_nouveau}
                          onChange={e => updateRow(i, { type_nouveau: e.target.value })}
                          options={[
                            { v: 'physique', l: 'Personne physique' },
                            { v: 'morale', l: 'Personne morale' },
                          ]} />
                      </>
                    )}
                    <Field label="Part du bien (%) *" type="number" step="0.01" min="0" max="100"
                      value={r.pourcentage}
                      onChange={e => updateRow(i, { pourcentage: e.target.value })}
                      placeholder="ex: 50" />
                    <Field label="Notes" value={r.notes}
                      onChange={e => updateRow(i, { notes: e.target.value })}
                      placeholder="ex: indivision, usufruit..." />
                  </div>
                  <button onClick={() => removeRow(i)}
                    title="Retirer cette ligne"
                    className="text-gray-300 hover:text-red-500 cursor-pointer mt-7 flex-shrink-0">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={addRow}
            className="mt-3 w-full border border-dashed border-gray-300 rounded-lg py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50 hover:text-navy cursor-pointer transition-colors flex items-center justify-center gap-1.5">
            <Plus size={14} /> Ajouter un co-détenteur
          </button>

          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-gray-400">Total attribué aux tiers</span>
            <span className={`font-bold ${editOver ? 'text-red-500' : 'text-navy'}`}>
              {pctTxt(totalSaisi)} %
            </span>
          </div>

          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

          <div className="flex justify-end gap-3 mt-5">
            <Btn variant="ghost" onClick={() => setOpen(false)}>Annuler</Btn>
            <Btn onClick={save} disabled={saving || editOver}>
              {saving ? 'Enregistrement...' : 'Enregistrer la répartition'}
            </Btn>
          </div>
        </Modal>
      )}
    </Card>
  )
}
