import { useState } from 'react'
import { Upload, FileText, CheckCircle, Plus, ArrowRight, AlertTriangle, Scissors } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { extractFromPDF, fileToBase64 } from '../lib/extraction'
import { fmt, fmtDate } from '../lib/utils'
import { Modal, Field, Sel, Grid2, Grid3, Btn } from './UI'

// ── Steps: idle → extracting → confirm → done ──────────────

export default function SmartUpload({ onClose, bienId: initialBienId }) {
  const { biens, locataires, baux, transactions, selected, reload } = useSociete()

  const [step, setStep] = useState('idle') // idle | extracting | confirm_bail | confirm_amort | confirm_charges | confirm_quittance | confirm_generic | error
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [trimInfo, setTrimInfo] = useState(null)

  // Bail linking state
  const [bienChoice, setBienChoice] = useState(initialBienId || '')
  const [createBien, setCreateBien] = useState(false)
  const [locChoice, setLocChoice] = useState('')
  const [createLoc, setCreateLoc] = useState(false)

  // Generic doc state
  const [genericBien, setGenericBien] = useState(initialBienId || '')
  const [genericType, setGenericType] = useState('autre')

  const handleFile = async (f) => {
    setFile(f)
    setStep('extracting')
    setError('')
    try {
      const base64 = await fileToBase64(f)
      const data = await extractFromPDF(base64, f.type || 'application/pdf')
      if (data._trimInfo) { setTrimInfo(data._trimInfo); delete data._trimInfo }
      setResult(data)

      if (!data?.type) {
        setStep('confirm_generic')
      } else if (data.type === 'bail') {
        setStep('confirm_bail')
        // Auto-match locataire by name
        if (data.locataire_raison_sociale || data.locataire_nom) {
          const match = locataires.find(l =>
            (data.locataire_raison_sociale && l.raison_sociale?.toLowerCase() === data.locataire_raison_sociale.toLowerCase()) ||
            (data.locataire_nom && l.nom?.toLowerCase() === data.locataire_nom.toLowerCase())
          )
          if (match) setLocChoice(match.id)
        }
        // Auto-match bien by address
        if (data.adresse && !initialBienId) {
          const match = biens.find(b => b.adresse?.toLowerCase().includes(data.adresse.toLowerCase().slice(0, 15)))
          if (match) setBienChoice(match.id)
        }
      } else if (data.type === 'amortissement') {
        setStep('confirm_amort')
        if (!initialBienId) setBienChoice(biens[0]?.id || '')
      } else if (data.type === 'appel_charges') {
        setStep('confirm_charges')
        if (!initialBienId) setBienChoice(biens[0]?.id || '')
      } else if (data.type === 'quittance') {
        setStep('confirm_quittance')
      } else {
        setStep('confirm_generic')
      }
    } catch (err) {
      setError(err.message)
      setStep('error')
    }
  }

  // ── Save: Bail ──────────────────────────────────────────
  const saveBail = async () => {
    setSaving(true)
    const d = result
    let bId = bienChoice
    let lId = locChoice

    // Create bien if needed
    if (createBien) {
      const { data: nb, error: e } = await supabase.from('biens').insert({
        societe_id: selected.id,
        adresse: d.adresse || '', ville: d.ville || '', code_postal: d.code_postal || '',
        surface_rdc: d.surface_rdc, surface_sous_sol: d.surface_sous_sol,
        type: 'Commercial', statut_bien: 'Actif', activite: d.activite || '',
      }).select().single()
      if (e) { setError(e.message); setSaving(false); return }
      bId = nb.id
    }

    // Create locataire if needed
    if (createLoc) {
      const { data: nl, error: e } = await supabase.from('locataires').insert({
        societe_id: selected.id,
        raison_sociale: d.locataire_raison_sociale || '',
        nom: d.locataire_nom || '', prenom: d.locataire_prenom || '',
        email: d.locataire_email || '', telephone: d.locataire_telephone || '',
        adresse: d.locataire_adresse || '', code_postal: d.locataire_code_postal || '',
        ville: d.locataire_ville || '',
      }).select().single()
      if (e) { setError(e.message); setSaving(false); return }
      lId = nl.id
    }

    if (!bId || !lId) { setError('Bien et locataire requis.'); setSaving(false); return }

    // Create bail
    const { error: e } = await supabase.from('baux').insert({
      societe_id: selected.id, bien_id: bId, locataire_id: lId,
      loyer_ht: d.loyer_mensuel || 0, charges: d.charges || 0, depot: d.depot_garantie,
      type_bail: d.type_bail || 'commercial', indice_revision: d.indexation || 'ILC',
      date_debut: d.date_debut || null, date_fin: d.date_fin || null,
      date_revision_anniversaire: d.date_revision_anniversaire || null,
      utilisation: d.utilisation || d.activite || '', actif: true,
    })
    if (e) { setError(e.message); setSaving(false); return }

    // Store document
    await storeDoc(bId, 'bail', d)
    setSaving(false)
    reload()
    onClose()
  }

  // ── Save: Amortissement ─────────────────────────────────
  const saveAmort = async () => {
    setSaving(true)
    const d = result
    const bId = bienChoice || initialBienId
    if (!bId) { setError('Sélectionnez un bien.'); setSaving(false); return }

    const { error: e } = await supabase.from('biens').update({
      montant_emprunt: d.montant_emprunt, duree_credit: d.duree_credit,
      annuites: d.annuites, decalage_pret: d.decalage_pret,
    }).eq('id', bId)
    if (e) { setError(e.message); setSaving(false); return }

    await storeDoc(bId, 'amortissement', d)
    setSaving(false)
    reload()
    onClose()
  }

  // ── Save: Charges ───────────────────────────────────────
  const saveCharges = async () => {
    setSaving(true)
    const d = result
    const bId = bienChoice || initialBienId
    if (!bId) { setError('Sélectionnez un bien.'); setSaving(false); return }

    const lignes = d.lignes || []
    const ref = lignes.filter(l => l.refacturable).reduce((s, l) => s + (l.montant || 0), 0)
    const nonRef = lignes.filter(l => !l.refacturable).reduce((s, l) => s + (l.montant || 0), 0)

    const { error: e1 } = await supabase.from('appels_charges').insert({
      bien_id: bId, societe_id: selected.id,
      periode: d.periode || '', montant_total: d.montant_total || (ref + nonRef),
      charges_refacturables: ref, charges_non_refacturables: nonRef, lignes,
    })
    if (e1) { setError(e1.message); setSaving(false); return }

    await supabase.from('biens').update({ charges_refacturables: ref, charges_non_refacturables: nonRef }).eq('id', bId)
    await storeDoc(bId, 'appel_charges', d)
    setSaving(false)
    reload()
    onClose()
  }

  // ── Save: Quittance ─────────────────────────────────────
  const saveQuittance = async () => {
    setSaving(true)
    const d = result
    // Try to match a transaction
    if (d.bail_id && d.mois !== undefined && d.annee) {
      await supabase.from('transactions').update({ statut: 'payé', date_paiement: d.date_paiement || new Date().toISOString().slice(0, 10) })
        .eq('bail_id', d.bail_id).eq('mois', d.mois).eq('annee', d.annee)
    }
    const bId = initialBienId || bienChoice || biens[0]?.id
    if (bId) await storeDoc(bId, 'quittance', d)
    setSaving(false)
    reload()
    onClose()
  }

  // ── Save: Generic doc ───────────────────────────────────
  const saveGeneric = async () => {
    setSaving(true)
    const bId = genericBien || initialBienId
    if (bId && file) await storeDoc(bId, genericType, null)
    setSaving(false)
    reload()
    onClose()
  }

  // ── Store document in DB + Storage ──────────────────────
  const storeDoc = async (bienId, type) => {
    if (!file || !bienId) return
    const path = `${selected.id}/${bienId}/${type}/${Date.now()}_${file.name}`
    const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
    if (upErr) return
    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
    await supabase.from('documents').insert({
      societe_id: selected.id, bien_id: bienId,
      type, nom: file.name, fichier_url: publicUrl, taille: file.size,
    })
  }

  // ── Bien selector component ─────────────────────────────
  const BienSelector = ({ showCreate = false, addrHint = '' }) => (
    <div className="mb-4">
      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Rattacher à un bien</label>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {biens.map(b => (
          <label key={b.id} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors text-sm ${bienChoice === b.id && !createBien ? 'bg-blue-50 border border-blue-300' : 'bg-gray-50 hover:bg-gray-100 border border-transparent'}`}>
            <input type="radio" name="su_bien" checked={bienChoice === b.id && !createBien}
              onChange={() => { setBienChoice(b.id); setCreateBien(false) }} className="accent-blue-600" />
            <span className="font-medium text-navy">{b.reference || b.adresse}, {b.ville}</span>
          </label>
        ))}
        {showCreate && (
          <label className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors text-sm ${createBien ? 'bg-emerald-50 border border-emerald-300' : 'bg-gray-50 hover:bg-gray-100 border border-transparent'}`}>
            <input type="radio" name="su_bien" checked={createBien}
              onChange={() => { setCreateBien(true); setBienChoice('') }} className="accent-emerald-600" />
            <span className="font-medium text-emerald-700"><Plus size={12} className="inline mr-1" />Créer un nouveau bien {addrHint && <span className="text-gray-400">({addrHint})</span>}</span>
          </label>
        )}
      </div>
    </div>
  )

  // ── Locataire selector ──────────────────────────────────
  const LocSelector = ({ nameHint = '' }) => (
    <div className="mb-4">
      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Rattacher à un locataire</label>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {locataires.map(l => (
          <label key={l.id} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors text-sm ${locChoice === l.id && !createLoc ? 'bg-blue-50 border border-blue-300' : 'bg-gray-50 hover:bg-gray-100 border border-transparent'}`}>
            <input type="radio" name="su_loc" checked={locChoice === l.id && !createLoc}
              onChange={() => { setLocChoice(l.id); setCreateLoc(false) }} className="accent-blue-600" />
            <span className="font-medium text-navy">{l.raison_sociale || `${l.prenom || ''} ${l.nom || ''}`.trim() || '—'}</span>
          </label>
        ))}
        <label className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors text-sm ${createLoc ? 'bg-emerald-50 border border-emerald-300' : 'bg-gray-50 hover:bg-gray-100 border border-transparent'}`}>
          <input type="radio" name="su_loc" checked={createLoc}
            onChange={() => { setCreateLoc(true); setLocChoice('') }} className="accent-emerald-600" />
          <span className="font-medium text-emerald-700"><Plus size={12} className="inline mr-1" />Créer un nouveau locataire {nameHint && <span className="text-gray-400">({nameHint})</span>}</span>
        </label>
      </div>
    </div>
  )

  const title = {
    idle: 'Ajouter un document',
    extracting: 'Analyse en cours...',
    confirm_bail: 'Bail détecté',
    confirm_amort: 'Tableau d\'amortissement détecté',
    confirm_charges: 'Appel de charges détecté',
    confirm_quittance: 'Quittance détectée',
    confirm_generic: 'Document',
    error: 'Erreur',
  }[step]

  return (
    <Modal title={title} onClose={onClose} width="max-w-2xl">

      {/* ── IDLE: file picker ────────────────────────── */}
      {step === 'idle' && (
        <div className="text-center py-10">
          <label className="inline-flex flex-col items-center gap-3 cursor-pointer group">
            <div className="w-20 h-20 rounded-2xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
              <Upload size={32} className="text-blue-500" />
            </div>
            <span className="text-sm font-semibold text-navy">Choisir un fichier</span>
            <span className="text-xs text-gray-400">PDF, image — bail, tableau d'amortissement, appel de charges, quittance...</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
              onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }} />
          </label>
        </div>
      )}

      {/* ── EXTRACTING: spinner ──────────────────────── */}
      {step === 'extracting' && (
        <div className="text-center py-10">
          <div className="animate-spin w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-gray-500">L'IA analyse votre document...</p>
          <p className="text-xs text-gray-300 mt-1">{file?.name}</p>
        </div>
      )}

      {/* ── ERROR ────────────────────────────────────── */}
      {step === 'error' && (
        <div className="text-center py-6">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="text-red-500 text-sm mb-4">{error}</p>
          <div className="flex justify-center gap-3">
            <Btn variant="ghost" onClick={() => setStep('idle')}>Réessayer</Btn>
            <Btn variant="ghost" onClick={() => { setStep('confirm_generic'); setResult({}) }}>Ajouter manuellement</Btn>
          </div>
        </div>
      )}

      {/* ── CONFIRM: Bail ────────────────────────────── */}
      {step === 'confirm_bail' && result && (() => {
        const d = result
        const rv = (k, v) => setResult(p => ({ ...p, [k]: v }))
        const locLabel = d.locataire_raison_sociale || `${d.locataire_prenom || ''} ${d.locataire_nom || ''}`.trim() || '—'
        const addrLabel = [d.adresse, d.code_postal, d.ville].filter(Boolean).join(', ')
        return (
          <>
            {trimInfo && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-xs text-amber-700">
                Document volumineux ({trimInfo.totalPages} pages). Seules les {trimInfo.sentPages} premières pages ont été analysées. Vérifiez que toutes les données sont correctes.
              </div>
            )}
            <p className="text-xs text-gray-400 mb-3">Vérifiez et corrigez les données extraites avant validation.</p>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Locataire</h4>
            <Grid2>
              <Field label="Raison sociale" value={d.locataire_raison_sociale || ''} onChange={e => rv('locataire_raison_sociale', e.target.value)} />
              <Grid2>
                <Field label="Prénom" value={d.locataire_prenom || ''} onChange={e => rv('locataire_prenom', e.target.value)} />
                <Field label="Nom" value={d.locataire_nom || ''} onChange={e => rv('locataire_nom', e.target.value)} />
              </Grid2>
            </Grid2>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 mt-3">Bien</h4>
            <Grid3>
              <Field label="Adresse" value={d.adresse || ''} onChange={e => rv('adresse', e.target.value)} />
              <Field label="Ville" value={d.ville || ''} onChange={e => rv('ville', e.target.value)} />
              <Field label="Code postal" value={d.code_postal || ''} onChange={e => rv('code_postal', e.target.value)} />
            </Grid3>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 mt-3">Bail</h4>
            <Grid3>
              <Field label="Loyer HT (€/mois)" type="number" value={d.loyer_mensuel ?? ''} onChange={e => rv('loyer_mensuel', e.target.value === '' ? null : Number(e.target.value))} />
              <Field label="Charges (€/mois)" type="number" value={d.charges ?? ''} onChange={e => rv('charges', e.target.value === '' ? null : Number(e.target.value))} />
              <Field label="Dépôt garantie (€)" type="number" value={d.depot_garantie ?? ''} onChange={e => rv('depot_garantie', e.target.value === '' ? null : Number(e.target.value))} />
            </Grid3>
            <Grid3>
              <Sel label="Type bail" value={d.type_bail || 'commercial'} onChange={e => rv('type_bail', e.target.value)}
                options={[{v:'commercial',l:'Commercial'},{v:'professionnel',l:'Professionnel'},{v:'habitation',l:'Habitation'}]} />
              <Sel label="Indexation" value={d.indexation || 'ILC'} onChange={e => rv('indexation', e.target.value)}
                options={[{v:'ILC',l:'ILC'},{v:'ICC',l:'ICC'},{v:'IRL',l:'IRL'}]} />
              <Field label="Activité" value={d.activite || ''} onChange={e => rv('activite', e.target.value)} />
            </Grid3>
            <Grid3>
              <Field label="Date début" type="date" value={d.date_debut || ''} onChange={e => rv('date_debut', e.target.value)} />
              <Field label="Date fin" type="date" value={d.date_fin || ''} onChange={e => rv('date_fin', e.target.value)} />
              <Field label="Date révision" type="date" value={d.date_revision_anniversaire || ''} onChange={e => rv('date_revision_anniversaire', e.target.value)} />
            </Grid3>
            <BienSelector showCreate addrHint={addrLabel} />
            <LocSelector nameHint={locLabel} />
            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
            <div className="flex justify-end gap-3 mt-2">
              <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
              <Btn onClick={saveBail} disabled={saving || (!bienChoice && !createBien) || (!locChoice && !createLoc)}>
                {saving ? 'Enregistrement...' : <><CheckCircle size={14} /> Créer le bail</>}
              </Btn>
            </div>
          </>
        )
      })()}

      {/* ── CONFIRM: Amortissement ───────────────────── */}
      {step === 'confirm_amort' && result && (() => {
        const rv = (k, v) => setResult(p => ({ ...p, [k]: v }))
        return (
        <>
          <p className="text-xs text-gray-400 mb-3">Vérifiez et corrigez les données extraites avant validation.</p>
          <Grid2>
            <Field label="Montant emprunt (€)" type="number" value={result.montant_emprunt ?? ''} onChange={e => rv('montant_emprunt', e.target.value === '' ? null : Number(e.target.value))} />
            <Field label="Durée (mois)" type="number" value={result.duree_credit ?? ''} onChange={e => rv('duree_credit', e.target.value === '' ? null : Number(e.target.value))} />
          </Grid2>
          <Grid2>
            <Field label="Taux (%)" type="number" step="0.01" value={result.taux ?? ''} onChange={e => rv('taux', e.target.value === '' ? null : Number(e.target.value))} />
            <Field label="Mensualité (€/mois)" type="number" value={result.annuites ?? ''} onChange={e => rv('annuites', e.target.value === '' ? null : Number(e.target.value))} />
          </Grid2>
          <BienSelector />
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
          <div className="flex justify-end gap-3 mt-2">
            <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
            <Btn onClick={saveAmort} disabled={saving || !bienChoice}>
              {saving ? 'Enregistrement...' : <><CheckCircle size={14} /> Enregistrer</>}
            </Btn>
          </div>
        </>
        )
      })()}

      {/* ── CONFIRM: Charges ─────────────────────────── */}
      {step === 'confirm_charges' && result && (() => {
        const lignes = result.lignes || []
        const ref = lignes.filter(l => l.refacturable).reduce((s, l) => s + (l.montant || 0), 0)
        const nonRef = lignes.filter(l => !l.refacturable).reduce((s, l) => s + (l.montant || 0), 0)
        return (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-[11px] text-gray-400 uppercase font-semibold">Période</p>
                <p className="font-bold text-navy">{result.periode || '—'}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-[11px] text-emerald-600 uppercase font-semibold">Refacturables</p>
                <p className="font-bold text-emerald-700">{fmt(ref)}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-[11px] text-red-600 uppercase font-semibold">Non refacturables</p>
                <p className="font-bold text-red-600">{fmt(nonRef)}</p>
              </div>
            </div>
            {lignes.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden mb-4 max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50"><th className="px-3 py-2 text-left text-xs font-bold text-gray-400">Poste</th><th className="px-3 py-2 text-right text-xs font-bold text-gray-400">Montant</th><th className="px-3 py-2 text-center text-xs font-bold text-gray-400">Refact.</th></tr></thead>
                  <tbody>
                    {lignes.map((l, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 text-navy">{l.poste}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{fmt(l.montant)}</td>
                        <td className="px-3 py-1.5 text-center">
                          <button onClick={() => setResult(prev => ({ ...prev, lignes: prev.lignes.map((x, j) => j === i ? { ...x, refacturable: !x.refacturable } : x) }))}
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer ${l.refacturable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                            {l.refacturable ? 'Oui' : 'Non'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <BienSelector />
            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
            <div className="flex justify-end gap-3 mt-2">
              <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
              <Btn onClick={saveCharges} disabled={saving || !bienChoice}>
                {saving ? 'Enregistrement...' : <><CheckCircle size={14} /> Enregistrer les charges</>}
              </Btn>
            </div>
          </>
        )
      })()}

      {/* ── CONFIRM: Quittance ───────────────────────── */}
      {step === 'confirm_quittance' && result && (
        <>
          <div className="bg-green-50 rounded-xl p-4 mb-4 border border-green-200 text-sm">
            <p className="text-gray-500">Quittance de loyer détectée. Le document sera stocké.</p>
          </div>
          {!initialBienId && (
            <Sel label="Bien" value={genericBien} onChange={e => setGenericBien(e.target.value)}
              options={[{ v: '', l: 'Sélectionner un bien' }, ...biens.map(b => ({ v: b.id, l: b.reference || b.adresse }))]} />
          )}
          <div className="flex justify-end gap-3 mt-2">
            <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
            <Btn onClick={saveQuittance} disabled={saving}>
              {saving ? 'Enregistrement...' : <><CheckCircle size={14} /> Enregistrer</>}
            </Btn>
          </div>
        </>
      )}

      {/* ── CONFIRM: Generic doc ─────────────────────── */}
      {step === 'confirm_generic' && (
        <>
          <p className="text-sm text-gray-400 mb-4">Type non reconnu automatiquement. Classez le document manuellement.</p>
          {!initialBienId && (
            <Sel label="Bien *" value={genericBien} onChange={e => setGenericBien(e.target.value)}
              options={[{ v: '', l: 'Sélectionner un bien' }, ...biens.map(b => ({ v: b.id, l: b.reference || b.adresse }))]} />
          )}
          <Sel label="Type" value={genericType} onChange={e => setGenericType(e.target.value)}
            options={[
              { v: 'bail', l: 'Bail & avenant' }, { v: 'amortissement', l: 'Tableau d\'amortissement' },
              { v: 'appel_charges', l: 'Appel de charges' }, { v: 'quittance', l: 'Quittance de loyer' },
              { v: 'facture', l: 'Facture' }, { v: 'avis_echeance', l: 'Avis d\'échéance' },
              { v: 'commandement', l: 'Commandement de payer' }, { v: 'diagnostic', l: 'Diagnostic immobilier' },
              { v: 'acte_vente', l: 'Acte de vente' }, { v: 'autre', l: 'Autre' },
            ]} />
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
            <Btn onClick={saveGeneric} disabled={saving || (!genericBien && !initialBienId)}>
              {saving ? 'Enregistrement...' : <><CheckCircle size={14} /> Enregistrer</>}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  )
}
