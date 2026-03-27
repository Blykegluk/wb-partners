import { useState } from 'react'
import { Building2, Plus, Trash2, ExternalLink, Upload, MapPin, Zap, FileText, Users, FolderOpen, ArrowRight, Link, Receipt, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { fmt, fmtDate, googleMapsUrl, DOC_TYPES } from '../lib/utils'
import { rendementBrut, rendementNet, cashflowMensuel } from '../lib/calculs'
import Timeline from '../components/Timeline'
import { extractFromPDF, fileToBase64 } from '../lib/extraction'
import { PageHeader, Card, Modal, Field, Sel, Check, Grid2, Grid3, Btn, Badge, Empty, AddressField } from '../components/UI'

const EMPTY_BIEN = {
  reference: '', adresse: '', ville: '', code_postal: '', latitude: null, longitude: null,
  surface_rdc: '', surface_sous_sol: '', type: 'Commercial', activite: '',
  type_bail: 'commercial', attribution_charges: '', indexation: 'ILC',
  prix_achat: '', frais_notaire_pct: '', frais_notaire: '', apport: '', montant_emprunt: '', duree_credit: '', decalage_pret: '',
  loyer_mensuel: '', charges: '', annuites: '',
  date_acquisition: '', presence_extraction: false, taxe_fonciere: '', statut_bien: 'Actif',
}

// Local UI state defaults (not saved to DB)
const EMPTY_UI = { apport_mode: 'euro', apport_pct: '', duree_mode: 'annees', duree_annees: '' }

export default function Biens({ navigate }) {
  const { biens, baux, locataires, documents, transactions, appelsCharges, selected, canEdit, reload } = useSociete()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(null)
  const [f, setF] = useState(EMPTY_BIEN)
  const [ui, setUi] = useState(EMPTY_UI)
  const [detail, setDetail] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [extractSuccess, setExtractSuccess] = useState('')

  const openNew = () => { setEdit(null); setF(EMPTY_BIEN); setUi(EMPTY_UI); setExtractError(''); setExtractSuccess(''); setOpen(true) }
  const openEdit = (b) => {
    setEdit(b)
    setF({ ...EMPTY_BIEN, ...b })
    const da = b.duree_credit ? Math.round(b.duree_credit / 12) : ''
    setUi({ ...EMPTY_UI, duree_annees: da, duree_mode: 'annees' })
    setExtractError('')
    setOpen(true)
  }
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  const num = (k, v) => u(k, v === '' ? '' : v)

  // ── Live computed values ────────────────────────────────
  const prixAchat = Number(f.prix_achat) || 0
  const fraisNotaire = f.frais_notaire !== '' ? Number(f.frais_notaire) || 0
    : f.frais_notaire_pct !== '' ? Math.round(prixAchat * (Number(f.frais_notaire_pct) / 100)) : 0
  const coutTotal = prixAchat + fraisNotaire
  const apportCalc = ui.apport_mode === 'pct'
    ? Math.round(prixAchat * (Number(ui.apport_pct) / 100))
    : Number(f.apport) || 0
  const empruntCalc = Math.max(0, coutTotal - apportCalc)

  const [saveError, setSaveError] = useState('')

  const save = async () => {
    setSaveError('')
    if (!f.adresse?.trim() || !f.ville?.trim()) {
      setSaveError('Adresse et ville sont obligatoires.')
      return
    }

    const data = { ...f }
    // Write back computed values
    data.apport = apportCalc || null
    data.montant_emprunt = empruntCalc || null
    data.frais_notaire = fraisNotaire || null
    // Convert numeric fields
    for (const k of ['surface_rdc','surface_sous_sol','prix_achat','apport','montant_emprunt','duree_credit','decalage_pret','loyer_mensuel','charges','annuites','taxe_fonciere','latitude','longitude','frais_notaire','frais_notaire_pct']) {
      data[k] = data[k] === '' || data[k] === null || data[k] === undefined ? null : Number(data[k])
    }
    // Clean boolean
    data.presence_extraction = !!data.presence_extraction
    // Remove non-DB fields
    delete data.id; delete data.created_at; delete data._role

    let error
    if (edit) {
      ({ error } = await supabase.from('biens').update(data).eq('id', edit.id))
    } else {
      ({ error } = await supabase.from('biens').insert({ ...data, societe_id: selected.id }))
    }

    if (error) {
      console.error('Supabase error:', error)
      setSaveError(error.message || 'Erreur lors de la sauvegarde.')
      return
    }
    setOpen(false)
    reload()
  }

  const del = async (id) => {
    if (!confirm('Supprimer ce bien et toutes ses données associées ?')) return
    await supabase.from('biens').delete().eq('id', id)
    reload()
  }

  // ── Inline bail creation / linking ──────────────────────────
  const EMPTY_BAIL = {
    bien_id: '', locataire_id: '', date_debut: '', date_fin: '',
    loyer_ht: '', loyer_an1: '', loyer_an2: '', charges: '', depot: '',
    type_bail: 'commercial', utilisation: '', indice_revision: 'ILC',
    date_revision_anniversaire: '', actif: true,
  }
  const EMPTY_LOC = { raison_sociale: '', prenom: '', nom: '', email: '', telephone: '', adresse: '', code_postal: '', ville: '' }

  const [bailModal, setBailModal] = useState(null) // null = closed, { bienId, mode: 'new'|'link' }
  const [bf, setBf] = useState(EMPTY_BAIL)
  const [newLocModal, setNewLocModal] = useState(false)
  const [lf, setLf] = useState(EMPTY_LOC)

  const openBailNew = (bienId, locataireId = '') => {
    setBf({ ...EMPTY_BAIL, bien_id: bienId, locataire_id: locataireId })
    setBailModal({ bienId, mode: 'new' })
  }
  const openBailLink = (bienId) => {
    setBailModal({ bienId, mode: 'link' })
  }
  const openLocLink = (bienId) => {
    setBailModal({ bienId, mode: 'loc' })
  }

  const saveBail = async () => {
    const data = { ...bf }
    for (const k of ['loyer_ht','loyer_an1','loyer_an2','charges','depot']) {
      data[k] = data[k] === '' || data[k] === null ? null : Number(data[k])
    }
    data.actif = Boolean(data.actif)
    delete data.id; delete data.created_at
    await supabase.from('baux').insert({ ...data, societe_id: selected.id })
    setBailModal(null)
    reload()
  }

  const linkBail = async (bailId, bienId) => {
    await supabase.from('baux').update({ bien_id: bienId }).eq('id', bailId)
    setBailModal(null)
    reload()
  }

  const saveNewLoc = async () => {
    const data = { ...lf }
    delete data.id; delete data.created_at; delete data.societe_id
    const { data: inserted } = await supabase.from('locataires').insert({ ...data, societe_id: selected.id }).select().single()
    if (inserted) setBf(p => ({ ...p, locataire_id: inserted.id }))
    setNewLocModal(false)
    reload()
  }

  // ── Appel de charges ─────────────────────────────────────
  const [chargeModal, setChargeModal] = useState(null) // { bienId }
  const [chargeExtracting, setChargeExtracting] = useState(false)
  const [chargeResult, setChargeResult] = useState(null) // extracted data
  const [chargeError, setChargeError] = useState('')

  const handleChargeUpload = async (file, bienId) => {
    setChargeExtracting(true)
    setChargeError('')
    setChargeResult(null)
    try {
      const base64 = await fileToBase64(file)
      const result = await extractFromPDF(base64, file.type || 'application/pdf')
      if (result.type !== 'appel_charges') {
        setChargeError("Ce document n'a pas été reconnu comme un appel de charges/fonds.")
        return
      }
      setChargeResult(result)
    } catch (err) {
      setChargeError(err.message)
    }
    setChargeExtracting(false)
  }

  const saveCharges = async (bienId) => {
    if (!chargeResult) return
    const ref = chargeResult.charges_refacturables ?? (chargeResult.lignes || []).filter(l => l.refacturable).reduce((s, l) => s + (l.montant || 0), 0)
    const nonRef = chargeResult.charges_non_refacturables ?? (chargeResult.lignes || []).filter(l => !l.refacturable).reduce((s, l) => s + (l.montant || 0), 0)
    await supabase.from('appels_charges').insert({
      bien_id: bienId,
      societe_id: selected.id,
      periode: chargeResult.periode || '',
      montant_total: chargeResult.montant_total || (ref + nonRef),
      charges_refacturables: ref,
      charges_non_refacturables: nonRef,
      lignes: chargeResult.lignes || [],
    })
    // Update bien charges with refacturable monthly amount
    await supabase.from('biens').update({
      charges_refacturables: ref,
      charges_non_refacturables: nonRef,
    }).eq('id', bienId)
    setChargeModal(null)
    setChargeResult(null)
    reload()
  }

  // ── Bail upload wizard ──────────────────────────────────
  const [bailWizard, setBailWizard] = useState(null) // { step, data, extracting }

  const handleBailUpload = async (file) => {
    setBailWizard({ step: 'extracting', data: null })
    try {
      const base64 = await fileToBase64(file)
      const result = await extractFromPDF(base64, file.type || 'application/pdf')
      if (result.type !== 'bail') {
        setBailWizard({ step: 'error', error: "Ce document n'a pas été reconnu comme un bail." })
        return
      }
      setBailWizard({ step: 'link', data: result, bien_id: '', locataire_id: '', createLoc: false, createBien: false })
    } catch (err) {
      setBailWizard({ step: 'error', error: err.message })
    }
  }

  const saveBailWizard = async () => {
    const w = bailWizard
    const d = w.data
    let bienId = w.bien_id
    let locId = w.locataire_id

    // Create bien if needed
    if (w.createBien) {
      const { data: newBien } = await supabase.from('biens').insert({
        societe_id: selected.id,
        adresse: d.adresse || '', ville: d.ville || '', code_postal: d.code_postal || '',
        surface_rdc: d.surface_rdc, surface_sous_sol: d.surface_sous_sol,
        loyer_mensuel: d.loyer_mensuel, charges: d.charges,
        type_bail: d.type_bail || 'commercial', indexation: d.indexation || 'ILC',
        attribution_charges: d.attribution_charges || '', activite: d.activite || '',
        type: 'Commercial', statut_bien: 'Actif',
      }).select().single()
      if (newBien) bienId = newBien.id
    }

    // Create locataire if needed
    if (w.createLoc) {
      const { data: newLoc } = await supabase.from('locataires').insert({
        societe_id: selected.id,
        raison_sociale: d.locataire_raison_sociale || '',
        nom: d.locataire_nom || '', prenom: d.locataire_prenom || '',
        email: d.locataire_email || '', telephone: d.locataire_telephone || '',
        adresse: d.locataire_adresse || '', code_postal: d.locataire_code_postal || '',
        ville: d.locataire_ville || '',
      }).select().single()
      if (newLoc) locId = newLoc.id
    }

    if (!bienId || !locId) return

    // Create bail
    await supabase.from('baux').insert({
      societe_id: selected.id, bien_id: bienId, locataire_id: locId,
      loyer_ht: d.loyer_mensuel, charges: d.charges, depot: d.depot_garantie,
      type_bail: d.type_bail || 'commercial', indice_revision: d.indexation || 'ILC',
      date_debut: d.date_debut || null, date_fin: d.date_fin || null,
      date_revision_anniversaire: d.date_revision_anniversaire || null,
      utilisation: d.utilisation || d.activite || '', actif: true,
    })

    setBailWizard(null)
    reload()
  }

  // ── Extraction IA ─────────────────────────────────────────
  const handleExtract = async (file) => {
    setExtracting(true)
    setExtractError('')
    setExtractSuccess('')
    try {
      const base64 = await fileToBase64(file)
      const result = await extractFromPDF(base64, file.type || 'application/pdf')

      if (!result || !result.type) {
        setExtractError('Le document n\'a pas pu être analysé. Vérifiez qu\'il s\'agit d\'un bail ou d\'un tableau d\'amortissement lisible.')
      } else if (result.type === 'bail') {
        setF(p => ({
          ...p,
          adresse: result.adresse || p.adresse,
          ville: result.ville || p.ville,
          code_postal: result.code_postal || p.code_postal,
          surface_rdc: result.surface_rdc ?? p.surface_rdc,
          surface_sous_sol: result.surface_sous_sol ?? p.surface_sous_sol,
          loyer_mensuel: result.loyer_mensuel ?? p.loyer_mensuel,
          charges: result.charges ?? p.charges,
          type_bail: result.type_bail || p.type_bail,
          indexation: result.indexation || p.indexation,
          attribution_charges: result.attribution_charges || p.attribution_charges,
          activite: result.activite || p.activite,
        }))
        setExtractSuccess('Bail analysé — champs pré-remplis.')
      } else if (result.type === 'amortissement') {
        setF(p => ({
          ...p,
          montant_emprunt: result.montant_emprunt ?? p.montant_emprunt,
          duree_credit: result.duree_credit ?? p.duree_credit,
          annuites: result.annuites ?? p.annuites,
          decalage_pret: result.decalage_pret ?? p.decalage_pret,
        }))
        setExtractSuccess('Tableau d\'amortissement analysé — champs pré-remplis.')
      } else {
        setExtractError(`Type de document non reconnu : "${result.type}". Uploadez un bail ou un tableau d'amortissement.`)
      }
    } catch (err) {
      setExtractError(err.message)
    }
    setExtracting(false)
  }

  const rb = (b) => { const r = rendementBrut(b); return r !== null ? (r * 100).toFixed(1) + '%' : '—' }
  const rn = (b) => { const r = rendementNet(b); return r !== null ? (r * 100).toFixed(1) + '%' : '—' }
  const cf = (b) => cashflowMensuel(b)

  // ── Related data helpers ──────────────────────────────────
  const getBienBaux = (bienId) => baux.filter(ba => ba.bien_id === bienId)
  const getBienDocs = (bienId) => documents.filter(d => d.bien_id === bienId)
  const getBienImpayes = (bienId) => {
    const bailIds = getBienBaux(bienId).map(ba => ba.id)
    return transactions.filter(t => bailIds.includes(t.bail_id) && t.statut === 'impayé')
  }

  return (
    <div>
      <PageHeader title="Biens immobiliers" sub="Gérez votre patrimoine">
        {canEdit && (
          <div className="flex gap-2">
            <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-emerald-700 transition-colors">
              <Upload size={15} /> Uploader un bail
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={e => { if (e.target.files[0]) handleBailUpload(e.target.files[0]) }} />
            </label>
            <Btn onClick={openNew}><Plus size={15} /> Ajouter un bien</Btn>
          </div>
        )}
      </PageHeader>

      {biens.length === 0 ? (
        <Empty icon={<Building2 size={40} />} text="Aucun bien. Ajoutez votre premier bien immobilier." />
      ) : (
        <div className="space-y-3">
          {biens.map(b => {
            const bienBaux = getBienBaux(b.id)
            const bienDocs = getBienDocs(b.id)
            const bienImpayes = getBienImpayes(b.id)
            return (
            <Card key={b.id} className="p-5">
              <div className="flex justify-between items-start">
                <div className="flex-1 cursor-pointer" onClick={() => setDetail(detail?.id === b.id ? null : b)}>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-navy">{b.reference || b.adresse}</h3>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{b.type}</span>
                    {b.activite && <span className="text-xs text-gray-400">{b.activite}</span>}
                    {b.statut_bien && b.statut_bien !== 'Actif' && (
                      <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">{b.statut_bien}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <MapPin size={13} />
                      <a href={googleMapsUrl(b.adresse, b.ville, b.code_postal)} target="_blank" rel="noreferrer"
                        className="hover:text-blue-500 hover:underline" onClick={e => e.stopPropagation()}>
                        {b.adresse}, {b.code_postal} {b.ville}
                      </a>
                    </span>
                    <span>{b.surface_rdc || 0} m² RDC{b.surface_sous_sol ? ` + ${b.surface_sous_sol} m² SS` : ''}</span>
                  </div>
                  {/* Quick summary badges */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                      {bienBaux.filter(ba => ba.actif).length} bail{bienBaux.filter(ba => ba.actif).length > 1 ? 'x' : ''} actif{bienBaux.filter(ba => ba.actif).length > 1 ? 's' : ''}
                    </span>
                    <span className="text-[11px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                      {bienDocs.length} doc{bienDocs.length > 1 ? 's' : ''}
                    </span>
                    {bienImpayes.length > 0 && (
                      <span className="text-[11px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-semibold">
                        {bienImpayes.length} impayé{bienImpayes.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <p className="text-xs text-gray-400">Loyer</p>
                    <p className="font-bold text-navy">{fmt(b.loyer_mensuel)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Rdt brut</p>
                    <p className="font-bold text-emerald-600">{rb(b)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Cashflow</p>
                    <p className={`font-bold ${cf(b) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(cf(b))}</p>
                  </div>
                  <div className="flex gap-2">
                    {canEdit && <button onClick={() => openEdit(b)} className="text-gray-300 hover:text-blue-500 cursor-pointer text-xs font-medium">Modifier</button>}
                    {canEdit && <button onClick={() => del(b.id)} className="text-gray-300 hover:text-red-500 cursor-pointer"><Trash2 size={15} /></button>}
                  </div>
                </div>
              </div>

              {/* Detail expandable */}
              {detail?.id === b.id && (<>
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-4 gap-4 text-sm">
                  <div><p className="text-gray-400 text-xs mb-1">Prix d'achat</p><p className="font-semibold text-navy">{fmt(b.prix_achat)}</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Apport</p><p className="font-semibold text-navy">{fmt(b.apport)}</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Emprunt</p><p className="font-semibold text-navy">{fmt(b.montant_emprunt)}</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Durée crédit</p><p className="font-semibold text-navy">{b.duree_credit ? `${b.duree_credit} mois` : '—'}</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Différé prêt</p><p className="font-semibold text-navy">{b.decalage_pret ? `${b.decalage_pret} mois` : '—'}</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Annuités</p><p className="font-semibold text-navy">{fmt(b.annuites)}/mois</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Charges</p><p className="font-semibold text-navy">{fmt(b.charges)}/mois</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Taxe foncière</p><p className="font-semibold text-navy">{fmt(b.taxe_fonciere)}/an</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Type bail</p><p className="font-semibold text-navy capitalize">{b.type_bail || '—'}</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Indexation</p><p className="font-semibold text-navy">{b.indexation || '—'}</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Attrib. charges</p><p className="font-semibold text-navy">{b.attribution_charges || '—'}</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Date acquisition</p><p className="font-semibold text-navy">{fmtDate(b.date_acquisition)}</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Extraction VMC</p><p className="font-semibold text-navy">{b.presence_extraction ? 'Oui' : 'Non'}</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Rdt brut</p><p className="font-bold text-emerald-600">{rb(b)}</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Rdt net</p><p className="font-bold text-blue-600">{rn(b)}</p></div>
                  <div><p className="text-gray-400 text-xs mb-1">Cashflow/mois</p><p className={`font-bold ${cf(b) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(cf(b))}</p></div>
                </div>

                {/* ── Baux liés ─────────────────────────────────── */}
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                      <FileText size={13} /> Baux ({bienBaux.length})
                    </h4>
                    <div className="flex gap-2">
                      {canEdit && (
                        <button onClick={() => openBailNew(b.id)}
                          className="text-xs text-blue-500 hover:text-blue-700 font-semibold cursor-pointer flex items-center gap-1">
                          <Plus size={12} /> Nouveau bail
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={() => openLocLink(b.id)}
                          className="text-xs text-purple-500 hover:text-purple-700 font-semibold cursor-pointer flex items-center gap-1">
                          <Users size={12} /> Rattacher un locataire
                        </button>
                      )}
                      {canEdit && baux.filter(ba => ba.bien_id !== b.id).length > 0 && (
                        <button onClick={() => openBailLink(b.id)}
                          className="text-xs text-emerald-500 hover:text-emerald-700 font-semibold cursor-pointer flex items-center gap-1">
                          <Link size={12} /> Rattacher un bail
                        </button>
                      )}
                      {bienBaux.length > 0 && (
                        <button onClick={() => navigate('baux')}
                          className="text-xs text-gray-400 hover:text-navy font-medium cursor-pointer flex items-center gap-1">
                          Voir tout <ArrowRight size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                  {bienBaux.length === 0 ? (
                    <p className="text-sm text-gray-300 italic">Aucun bail — {canEdit && (
                      <>
                        <button onClick={() => openBailNew(b.id)} className="text-blue-500 hover:underline cursor-pointer">créer un bail</button>
                        {', '}
                        <button onClick={() => openLocLink(b.id)} className="text-purple-500 hover:underline cursor-pointer">rattacher un locataire</button>
                        {' ou '}
                        <button onClick={() => openBailLink(b.id)} className="text-emerald-500 hover:underline cursor-pointer">rattacher un bail</button>
                      </>
                    )}</p>
                  ) : (
                    <div className="space-y-2">
                      {bienBaux.map(ba => {
                        const loc = locataires.find(l => l.id === ba.locataire_id)
                        const nimp = transactions.filter(t => t.bail_id === ba.id && t.statut === 'impayé').length
                        return (
                          <div key={ba.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-3">
                              <Users size={14} className="text-gray-400" />
                              <div>
                                <button onClick={() => navigate('locataires')} className="text-sm font-semibold text-navy hover:text-blue-600 cursor-pointer">
                                  {loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || '—'}
                                </button>
                                <p className="text-[11px] text-gray-400">
                                  {fmtDate(ba.date_debut)} → {ba.date_fin ? fmtDate(ba.date_fin) : '∞'}
                                  {ba.type_bail && <span className="ml-2 capitalize">{ba.type_bail}</span>}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {nimp > 0 && (
                                <button onClick={() => navigate('relances')} className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer hover:bg-red-200">
                                  {nimp} impayé{nimp > 1 ? 's' : ''}
                                </button>
                              )}
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
                </div>

                {/* ── Charges / Appels de fonds ─────────────────── */}
                {(() => {
                  const bienCharges = appelsCharges.filter(ac => ac.bien_id === b.id)
                  const totalRef = b.charges_refacturables || 0
                  const totalNonRef = b.charges_non_refacturables || 0
                  return (
                    <div className="mt-5 pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                          <Receipt size={13} /> Charges ({bienCharges.length} appel{bienCharges.length > 1 ? 's' : ''})
                        </h4>
                        {canEdit && (
                          <label className="text-xs text-blue-500 hover:text-blue-700 font-semibold cursor-pointer flex items-center gap-1">
                            <Upload size={12} /> Ajouter un appel de fonds
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                              onChange={e => { if (e.target.files[0]) { setChargeModal({ bienId: b.id }); handleChargeUpload(e.target.files[0], b.id) } }} />
                          </label>
                        )}
                      </div>
                      {(totalRef > 0 || totalNonRef > 0) && (
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div className="bg-emerald-50 rounded-lg p-3">
                            <p className="text-[11px] text-emerald-600 font-semibold uppercase">Refacturables</p>
                            <p className="text-lg font-bold text-emerald-700">{fmt(totalRef)}<span className="text-xs font-normal">/an</span></p>
                          </div>
                          <div className="bg-red-50 rounded-lg p-3">
                            <p className="text-[11px] text-red-600 font-semibold uppercase">Non refacturables</p>
                            <p className="text-lg font-bold text-red-600">{fmt(totalNonRef)}<span className="text-xs font-normal">/an</span></p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-[11px] text-gray-500 font-semibold uppercase">Total charges</p>
                            <p className="text-lg font-bold text-navy">{fmt(totalRef + totalNonRef)}<span className="text-xs font-normal">/an</span></p>
                          </div>
                        </div>
                      )}
                      {bienCharges.length > 0 && (
                        <div className="space-y-1">
                          {bienCharges.map(ac => (
                            <div key={ac.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50 text-xs">
                              <span className="text-gray-500">{ac.periode || 'Sans période'}</span>
                              <span className="font-semibold text-navy">{fmt(ac.montant_total)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {bienCharges.length === 0 && totalRef === 0 && totalNonRef === 0 && (
                        <p className="text-sm text-gray-300 italic">Aucun appel de charges.</p>
                      )}
                    </div>
                  )
                })()}

                {/* ── Documents liés ────────────────────────────── */}
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                      <FolderOpen size={13} /> Documents ({bienDocs.length})
                    </h4>
                    <div className="flex gap-2">
                      {canEdit && (
                        <button onClick={() => navigate('documents', { openNew: true, bien_id: b.id })}
                          className="text-xs text-blue-500 hover:text-blue-700 font-semibold cursor-pointer flex items-center gap-1">
                          <Plus size={12} /> Ajouter
                        </button>
                      )}
                      {bienDocs.length > 0 && (
                        <button onClick={() => navigate('documents')}
                          className="text-xs text-gray-400 hover:text-navy font-medium cursor-pointer flex items-center gap-1">
                          Voir tout <ArrowRight size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                  {bienDocs.length === 0 ? (
                    <p className="text-sm text-gray-300 italic">Aucun document — {canEdit && <button onClick={() => navigate('documents', { openNew: true, bien_id: b.id })} className="text-blue-500 hover:underline cursor-pointer">uploader un document</button>}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {bienDocs.slice(0, 6).map(d => {
                        const ti = DOC_TYPES.find(t => t.v === d.type) || { l: d.type, color: '#64748b' }
                        return (
                          <a key={d.id} href={d.fichier_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-xs no-underline transition-colors">
                            <span className="w-2 h-2 rounded-full" style={{ background: ti.color }} />
                            <span className="text-navy font-medium">{d.nom}</span>
                            <span className="text-gray-300">{ti.l}</span>
                          </a>
                        )
                      })}
                      {bienDocs.length > 6 && (
                        <button onClick={() => navigate('documents')} className="text-xs text-blue-500 hover:underline cursor-pointer px-2 py-1.5">
                          +{bienDocs.length - 6} autres
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Quick actions ─────────────────────────────── */}
                {canEdit && (
                  <div className="mt-5 pt-4 border-t border-gray-100 flex gap-2 flex-wrap">
                    <Btn className="!text-xs !px-3 !py-1.5" onClick={() => openBailNew(b.id)}>
                      <Plus size={13} /> Nouveau bail
                    </Btn>
                    <Btn className="!text-xs !px-3 !py-1.5" variant="ghost" onClick={() => openLocLink(b.id)}>
                      <Users size={13} /> Rattacher un locataire
                    </Btn>
                    <Btn className="!text-xs !px-3 !py-1.5" variant="ghost" onClick={() => openBailLink(b.id)}>
                      <Link size={13} /> Rattacher un bail
                    </Btn>
                    <Btn className="!text-xs !px-3 !py-1.5" variant="ghost" onClick={() => navigate('documents', { openNew: true, bien_id: b.id })}>
                      <Upload size={13} /> Uploader un document
                    </Btn>
                    <Btn className="!text-xs !px-3 !py-1.5" variant="ghost" onClick={() => navigate('finances')}>
                      Échéancier <ArrowRight size={11} />
                    </Btn>
                  </div>
                )}

                <Timeline bienId={b.id} />
              </>)}
            </Card>
          )})}
        </div>
      )}

      {/* ── Modal Ajout / Édition ──────────────────────────── */}
      {open && (
        <Modal title={edit ? 'Modifier le bien' : 'Nouveau bien'} onClose={() => setOpen(false)} width="max-w-3xl">
          {/* Extraction IA */}
          {canEdit && !edit && (
            <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={16} className="text-blue-600" />
                <h4 className="text-sm font-bold text-blue-700">Extraction IA</h4>
              </div>
              <p className="text-xs text-blue-600 mb-3">Uploadez un bail ou un tableau d'amortissement pour pré-remplir les champs automatiquement.</p>
              <div className="flex gap-2">
                <label className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-blue-200 cursor-pointer hover:bg-blue-50 text-sm text-blue-700 font-medium">
                  <Upload size={14} />
                  {extracting ? 'Analyse en cours...' : 'Charger un document'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => { if (e.target.files[0]) handleExtract(e.target.files[0]) }} disabled={extracting} />
                </label>
              </div>
              {extractError && <p className="text-red-500 text-xs mt-2">{extractError}</p>}
              {extractSuccess && <p className="text-emerald-600 text-xs mt-2 font-medium">{extractSuccess}</p>}
            </div>
          )}

          {/* Identification */}
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Identification</h4>
          <Grid2>
            <Field label="Référence" placeholder="ex: Diderot" value={f.reference} onChange={e => u('reference', e.target.value)} />
            <Sel label="Type" value={f.type} onChange={e => u('type', e.target.value)}
              options={[{v:'Commercial',l:'Commercial'},{v:'Habitation',l:'Habitation'},{v:'Mixte',l:'Mixte'}]} />
          </Grid2>
          <AddressField label="Adresse" value={f.adresse} onChange={v => u('adresse', v)}
            onSelect={addr => setF(p => ({ ...p, ...addr }))} />
          <Grid3>
            <Field label="Ville" value={f.ville} onChange={e => u('ville', e.target.value)} />
            <Field label="Code postal" value={f.code_postal} onChange={e => u('code_postal', e.target.value)} />
            <Field label="Activité" placeholder="ex: Restaurant" value={f.activite} onChange={e => u('activite', e.target.value)} />
          </Grid3>

          {/* Surfaces */}
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 mt-6">Surfaces</h4>
          <Grid3>
            <Field label="Surface RDC (m²)" type="number" value={f.surface_rdc} onChange={e => num('surface_rdc', e.target.value)} />
            <Field label="Sous-sol (m²)" type="number" value={f.surface_sous_sol} onChange={e => num('surface_sous_sol', e.target.value)} />
            <Check label="Extraction VMC" checked={f.presence_extraction || false} onChange={e => u('presence_extraction', e.target.checked)} />
          </Grid3>

          {/* Bail */}
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 mt-6">Bail</h4>
          <Grid3>
            <Sel label="Type de bail" value={f.type_bail} onChange={e => u('type_bail', e.target.value)}
              options={[{v:'commercial',l:'Commercial'},{v:'professionnel',l:'Professionnel'},{v:'habitation',l:'Habitation'}]} />
            <Sel label="Indexation" value={f.indexation} onChange={e => u('indexation', e.target.value)}
              options={[{v:'ILC',l:'ILC'},{v:'ICC',l:'ICC'},{v:'IRL',l:'IRL'},{v:'autre',l:'Autre'}]} />
            <Field label="Attrib. charges" placeholder="ex: TEOM + entretien" value={f.attribution_charges} onChange={e => u('attribution_charges', e.target.value)} />
          </Grid3>

          {/* Financier */}
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 mt-6">Financier</h4>

          {/* Prix + Frais de notaire */}
          <Grid3>
            <Field label="Prix d'achat (€)" type="number" value={f.prix_achat} onChange={e => {
              const v = e.target.value
              setF(p => ({ ...p, prix_achat: v === '' ? '' : v, frais_notaire: p.frais_notaire_pct !== '' ? Math.round((Number(v) || 0) * (Number(p.frais_notaire_pct) / 100)) : p.frais_notaire }))
            }} />
            <div>
              <label className="block text-xs font-semibold text-navy mb-1">Frais de notaire</label>
              <div className="flex gap-1.5 mb-2">
                {[2.5, 7.5].map(pct => (
                  <button key={pct} type="button"
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${Number(f.frais_notaire_pct) === pct ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    onClick={() => {
                      const fn = Math.round(prixAchat * (pct / 100))
                      setF(p => ({ ...p, frais_notaire_pct: pct, frais_notaire: fn }))
                    }}>
                    {pct}%
                  </button>
                ))}
                <button type="button"
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${f.frais_notaire_pct === '' && f.frais_notaire !== '' ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  onClick={() => setF(p => ({ ...p, frais_notaire_pct: '' }))}>
                  Manuel
                </button>
              </div>
              <input type="number" placeholder="Montant (€)"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                value={f.frais_notaire_pct !== '' ? fraisNotaire : f.frais_notaire}
                onChange={e => setF(p => ({ ...p, frais_notaire: e.target.value === '' ? '' : e.target.value, frais_notaire_pct: '' }))}
                readOnly={f.frais_notaire_pct !== ''} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy mb-1">Coût total</label>
              <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-bold text-navy mt-5">
                {fmt(coutTotal)}
              </div>
            </div>
          </Grid3>

          {/* Apport + Emprunt */}
          <Grid3>
            <div>
              <label className="block text-xs font-semibold text-navy mb-1">Apport</label>
              <div className="flex gap-1.5 mb-2">
                <button type="button"
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${ui.apport_mode === 'euro' ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  onClick={() => { setUi(p => ({ ...p, apport_mode: 'euro' })); setF(p => ({ ...p, apport: apportCalc || '' })) }}>
                  €
                </button>
                <button type="button"
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${ui.apport_mode === 'pct' ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  onClick={() => {
                    const pct = prixAchat && f.apport ? Math.round((Number(f.apport) / prixAchat) * 100 * 10) / 10 : ''
                    setUi(p => ({ ...p, apport_mode: 'pct', apport_pct: pct }))
                  }}>
                  % du prix
                </button>
              </div>
              {ui.apport_mode === 'euro' ? (
                <input type="number" placeholder="Montant (€)"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  value={f.apport} onChange={e => num('apport', e.target.value)} />
              ) : (
                <input type="number" placeholder="% du prix d'achat" step="0.1"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  value={ui.apport_pct} onChange={e => setUi(p => ({ ...p, apport_pct: e.target.value }))} />
              )}
              {ui.apport_mode === 'pct' && prixAchat > 0 && ui.apport_pct !== '' && (
                <p className="text-xs text-gray-400 mt-1">= {fmt(apportCalc)}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy mb-1">Emprunt</label>
              <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-bold text-navy mt-5">
                {fmt(empruntCalc)}
              </div>
            </div>
            <Field label="Annuités (€/mois)" type="number" value={f.annuites} onChange={e => num('annuites', e.target.value)} />
          </Grid3>

          {/* Durée + Revenus */}
          <Grid3>
            <div>
              <label className="block text-xs font-semibold text-navy mb-1">Durée crédit</label>
              <div className="flex gap-1.5 mb-2">
                <button type="button"
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${ui.duree_mode === 'annees' ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  onClick={() => {
                    const a = f.duree_credit ? Math.round(Number(f.duree_credit) / 12) : ''
                    setUi(p => ({ ...p, duree_mode: 'annees', duree_annees: a }))
                  }}>
                  Années
                </button>
                <button type="button"
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${ui.duree_mode === 'mois' ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  onClick={() => setUi(p => ({ ...p, duree_mode: 'mois' }))}>
                  Mois
                </button>
              </div>
              {ui.duree_mode === 'annees' ? (
                <>
                  <input type="number" placeholder="Durée (années)"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    value={ui.duree_annees}
                    onChange={e => {
                      const a = e.target.value
                      setUi(p => ({ ...p, duree_annees: a }))
                      u('duree_credit', a === '' ? '' : Number(a) * 12)
                    }} />
                  {ui.duree_annees !== '' && <p className="text-xs text-gray-400 mt-1">= {Number(ui.duree_annees) * 12} mois</p>}
                </>
              ) : (
                <input type="number" placeholder="Durée (mois)"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  value={f.duree_credit} onChange={e => num('duree_credit', e.target.value)} />
              )}
            </div>
            <Field label="Différé prêt (mois)" type="number" value={f.decalage_pret} onChange={e => num('decalage_pret', e.target.value)} />
            <Field label="Taxe foncière (€/an)" type="number" value={f.taxe_fonciere} onChange={e => num('taxe_fonciere', e.target.value)} />
          </Grid3>
          <Grid3>
            <Field label="Loyer mensuel (€)" type="number" value={f.loyer_mensuel} onChange={e => num('loyer_mensuel', e.target.value)} />
            <Field label="Charges (€/mois)" type="number" value={f.charges} onChange={e => num('charges', e.target.value)} />
            <div />
          </Grid3>

          {/* Autres */}
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 mt-6">Autres</h4>
          <Grid2>
            <Field label="Date d'acquisition" type="date" value={f.date_acquisition || ''} onChange={e => u('date_acquisition', e.target.value)} />
            <Sel label="Statut" value={f.statut_bien} onChange={e => u('statut_bien', e.target.value)}
              options={[{v:'Actif',l:'Actif'},{v:'En vente',l:'En vente'},{v:'Vendu',l:'Vendu'}]} />
          </Grid2>

          {saveError && <p className="text-red-500 text-sm mt-2">{saveError}</p>}
          <div className="flex justify-end gap-3 mt-6">
            <Btn variant="ghost" onClick={() => setOpen(false)}>Annuler</Btn>
            <Btn onClick={save}>{edit ? 'Enregistrer' : 'Ajouter'}</Btn>
          </div>
        </Modal>
      )}

      {/* ── Modal Nouveau bail (inline) ──────────────────── */}
      {bailModal?.mode === 'new' && (
        <Modal title="Nouveau bail" onClose={() => setBailModal(null)} width="max-w-2xl">
          <Grid2>
            <div>
              <label className="block text-xs font-semibold text-navy mb-1">Bien</label>
              <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-navy">
                {biens.find(x => x.id === bailModal.bienId)?.reference || biens.find(x => x.id === bailModal.bienId)?.adresse || '—'}
              </div>
            </div>
            <div>
              <Sel label="Locataire *" value={bf.locataire_id} onChange={e => setBf(p => ({ ...p, locataire_id: e.target.value }))}
                options={[{ v: '', l: 'Sélectionner un locataire' }, ...locataires.map(l => ({ v: l.id, l: l.raison_sociale || `${l.prenom} ${l.nom}` }))]} />
              <button onClick={() => { setLf(EMPTY_LOC); setNewLocModal(true) }}
                className="text-xs text-blue-500 hover:underline cursor-pointer mt-1 flex items-center gap-1">
                <Plus size={11} /> Créer un nouveau locataire
              </button>
            </div>
          </Grid2>

          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 mt-4">Loyers</h4>
          <Grid3>
            <Field label="Loyer HT *" type="number" value={bf.loyer_ht} onChange={e => setBf(p => ({ ...p, loyer_ht: e.target.value }))} />
            <Field label="Loyer An 1" type="number" placeholder="Si progressif" value={bf.loyer_an1 || ''} onChange={e => setBf(p => ({ ...p, loyer_an1: e.target.value }))} />
            <Field label="Loyer An 2" type="number" placeholder="Si progressif" value={bf.loyer_an2 || ''} onChange={e => setBf(p => ({ ...p, loyer_an2: e.target.value }))} />
          </Grid3>
          <Grid3>
            <Field label="Charges (€/mois)" type="number" value={bf.charges} onChange={e => setBf(p => ({ ...p, charges: e.target.value }))} />
            <Field label="Dépôt de garantie (€)" type="number" value={bf.depot} onChange={e => setBf(p => ({ ...p, depot: e.target.value }))} />
            <Sel label="Type de bail" value={bf.type_bail} onChange={e => setBf(p => ({ ...p, type_bail: e.target.value }))}
              options={[{v:'commercial',l:'Commercial'},{v:'professionnel',l:'Professionnel'},{v:'habitation',l:'Habitation'}]} />
          </Grid3>

          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 mt-4">Dates & révision</h4>
          <Grid3>
            <Field label="Date début" type="date" value={bf.date_debut || ''} onChange={e => setBf(p => ({ ...p, date_debut: e.target.value }))} />
            <Field label="Date fin" type="date" value={bf.date_fin || ''} onChange={e => setBf(p => ({ ...p, date_fin: e.target.value }))} />
            <Field label="Date révision" type="date" value={bf.date_revision_anniversaire || ''} onChange={e => setBf(p => ({ ...p, date_revision_anniversaire: e.target.value }))} />
          </Grid3>
          <Grid2>
            <Sel label="Indice de révision" value={bf.indice_revision} onChange={e => setBf(p => ({ ...p, indice_revision: e.target.value }))}
              options={[{v:'ILC',l:'ILC'},{v:'ICC',l:'ICC'},{v:'IRL',l:'IRL'}]} />
            <Field label="Utilisation" placeholder="ex: Restauration" value={bf.utilisation} onChange={e => setBf(p => ({ ...p, utilisation: e.target.value }))} />
          </Grid2>

          <div className="flex justify-end gap-3 mt-6">
            <Btn variant="ghost" onClick={() => setBailModal(null)}>Annuler</Btn>
            <Btn onClick={saveBail} disabled={!bf.locataire_id || !bf.loyer_ht}>Créer le bail</Btn>
          </div>
        </Modal>
      )}

      {/* ── Modal Rattacher bail existant ─────────────────── */}
      {bailModal?.mode === 'link' && (() => {
        const otherBaux = baux.filter(ba => ba.bien_id !== bailModal.bienId)
        return (
          <Modal title="Rattacher un bail existant" onClose={() => setBailModal(null)} width="max-w-lg">
            {otherBaux.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucun bail disponible à rattacher.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {otherBaux.map(ba => {
                  const loc = locataires.find(l => l.id === ba.locataire_id)
                  const bien = biens.find(x => x.id === ba.bien_id)
                  return (
                    <div key={ba.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div>
                        <p className="text-sm font-semibold text-navy">
                          {loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || '—'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {bien?.reference || bien?.adresse || 'Sans bien'} — {fmt(ba.loyer_ht)}/mois — {fmtDate(ba.date_debut)} → {ba.date_fin ? fmtDate(ba.date_fin) : '∞'}
                        </p>
                      </div>
                      <Btn className="!text-xs !px-3 !py-1.5" onClick={() => linkBail(ba.id, bailModal.bienId)}>
                        <Link size={12} className="mr-1" /> Rattacher
                      </Btn>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <Btn variant="ghost" onClick={() => setBailModal(null)}>Fermer</Btn>
            </div>
          </Modal>
        )
      })()}

      {/* ── Modal Rattacher un locataire ─────────────────── */}
      {bailModal?.mode === 'loc' && (() => {
        // Locataires not already linked to this bien via a bail
        const linkedLocIds = new Set(baux.filter(ba => ba.bien_id === bailModal.bienId).map(ba => ba.locataire_id))
        const availableLocs = locataires.filter(l => !linkedLocIds.has(l.id))
        return (
          <Modal title="Rattacher un locataire" onClose={() => setBailModal(null)} width="max-w-lg">
            <p className="text-xs text-gray-400 mb-4">Sélectionnez un locataire existant pour créer un bail avec ce bien.</p>
            {availableLocs.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-400 mb-3">Tous les locataires sont déjà rattachés à ce bien.</p>
                <Btn className="!text-xs" onClick={() => { setBailModal(null); setLf(EMPTY_LOC); setNewLocModal(true) }}>
                  <Plus size={12} className="mr-1" /> Créer un nouveau locataire
                </Btn>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {availableLocs.map(l => {
                    const locBaux = baux.filter(ba => ba.locataire_id === l.id)
                    return (
                      <div key={l.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div>
                          <p className="text-sm font-semibold text-navy">
                            {l.raison_sociale || `${l.prenom || ''} ${l.nom || ''}`.trim() || '—'}
                          </p>
                          <p className="text-xs text-gray-400">
                            {l.email || '—'} {locBaux.length > 0 ? `· ${locBaux.length} bail${locBaux.length > 1 ? 'x' : ''}` : '· Aucun bail'}
                          </p>
                        </div>
                        <Btn className="!text-xs !px-3 !py-1.5" onClick={() => openBailNew(bailModal.bienId, l.id)}>
                          <ArrowRight size={12} className="mr-1" /> Créer un bail
                        </Btn>
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100">
                  <button onClick={() => { setBailModal(null); setLf(EMPTY_LOC); setNewLocModal(true) }}
                    className="text-xs text-blue-500 hover:underline cursor-pointer flex items-center gap-1">
                    <Plus size={11} /> Créer un nouveau locataire
                  </button>
                  <Btn variant="ghost" onClick={() => setBailModal(null)}>Fermer</Btn>
                </div>
              </>
            )}
          </Modal>
        )
      })()}

      {/* ── Modal Nouveau locataire (depuis bail) ────────── */}
      {newLocModal && (
        <Modal title="Nouveau locataire" onClose={() => setNewLocModal(false)} width="max-w-lg">
          <Grid2>
            <Field label="Raison sociale" value={lf.raison_sociale} onChange={e => setLf(p => ({ ...p, raison_sociale: e.target.value }))} />
            <div />
          </Grid2>
          <Grid2>
            <Field label="Prénom" value={lf.prenom} onChange={e => setLf(p => ({ ...p, prenom: e.target.value }))} />
            <Field label="Nom" value={lf.nom} onChange={e => setLf(p => ({ ...p, nom: e.target.value }))} />
          </Grid2>
          <Grid2>
            <Field label="Email" type="email" value={lf.email} onChange={e => setLf(p => ({ ...p, email: e.target.value }))} />
            <Field label="Téléphone" value={lf.telephone} onChange={e => setLf(p => ({ ...p, telephone: e.target.value }))} />
          </Grid2>
          <div className="flex justify-end gap-3 mt-6">
            <Btn variant="ghost" onClick={() => setNewLocModal(false)}>Annuler</Btn>
            <Btn onClick={saveNewLoc} disabled={!lf.raison_sociale && !lf.nom}>Créer</Btn>
          </div>
        </Modal>
      )}

      {/* ── Modal Appel de charges ───────────────────────── */}
      {chargeModal && (
        <Modal title="Appel de fonds / charges" onClose={() => { setChargeModal(null); setChargeResult(null); setChargeError('') }} width="max-w-2xl">
          {chargeExtracting && (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm text-gray-500">Analyse du document en cours...</p>
            </div>
          )}
          {chargeError && <p className="text-red-500 text-sm mb-4">{chargeError}</p>}
          {!chargeExtracting && !chargeResult && !chargeError && (
            <div className="text-center py-8">
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-sm font-semibold cursor-pointer hover:bg-blue-100 border border-blue-200">
                <Upload size={15} /> Charger un appel de fonds
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => { if (e.target.files[0]) handleChargeUpload(e.target.files[0], chargeModal.bienId) }} />
              </label>
            </div>
          )}
          {chargeResult && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-[11px] text-gray-400 uppercase font-semibold">Période</p>
                  <p className="font-bold text-navy">{chargeResult.periode || '—'}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-[11px] text-emerald-600 uppercase font-semibold">Refacturables</p>
                  <p className="font-bold text-emerald-700">{fmt((chargeResult.lignes || []).filter(l => l.refacturable).reduce((s, l) => s + (l.montant || 0), 0))}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-[11px] text-red-600 uppercase font-semibold">Non refacturables</p>
                  <p className="font-bold text-red-600">{fmt((chargeResult.lignes || []).filter(l => !l.refacturable).reduce((s, l) => s + (l.montant || 0), 0))}</p>
                </div>
              </div>
              {(chargeResult.lignes || []).length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50"><th className="px-3 py-2 text-left text-xs font-bold text-gray-400">Poste</th><th className="px-3 py-2 text-right text-xs font-bold text-gray-400">Montant</th><th className="px-3 py-2 text-center text-xs font-bold text-gray-400">Refacturable</th></tr></thead>
                    <tbody>
                      {chargeResult.lignes.map((l, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-navy">{l.poste}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmt(l.montant)}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => setChargeResult(prev => ({ ...prev, lignes: prev.lignes.map((x, j) => j === i ? { ...x, refacturable: !x.refacturable } : x) }))}
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
              <div className="flex justify-end gap-3">
                <Btn variant="ghost" onClick={() => { setChargeModal(null); setChargeResult(null) }}>Annuler</Btn>
                <Btn onClick={() => saveCharges(chargeModal.bienId)}>
                  <CheckCircle size={14} className="mr-1" /> Enregistrer les charges
                </Btn>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ── Wizard upload bail ───────────────────────────── */}
      {bailWizard && bailWizard.step === 'extracting' && (
        <Modal title="Analyse du bail" onClose={() => setBailWizard(null)} width="max-w-md">
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-gray-500">Extraction des données en cours...</p>
          </div>
        </Modal>
      )}
      {bailWizard && bailWizard.step === 'error' && (
        <Modal title="Erreur" onClose={() => setBailWizard(null)} width="max-w-md">
          <p className="text-red-500 text-sm mb-4">{bailWizard.error}</p>
          <div className="flex justify-end">
            <Btn variant="ghost" onClick={() => setBailWizard(null)}>Fermer</Btn>
          </div>
        </Modal>
      )}
      {bailWizard && bailWizard.step === 'link' && (() => {
        const d = bailWizard.data
        const w = bailWizard
        const locLabel = d.locataire_raison_sociale || `${d.locataire_prenom || ''} ${d.locataire_nom || ''}`.trim() || '—'
        const addrLabel = `${d.adresse || ''}, ${d.code_postal || ''} ${d.ville || ''}`.trim()
        return (
          <Modal title="Bail extrait — rattacher" onClose={() => setBailWizard(null)} width="max-w-2xl">
            {/* Résumé extraction */}
            <div className="bg-blue-50 rounded-xl p-4 mb-5 border border-blue-200">
              <h4 className="text-xs font-bold text-blue-700 uppercase mb-2">Données extraites</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div><span className="text-gray-400">Locataire :</span> <span className="font-semibold text-navy">{locLabel}</span></div>
                <div><span className="text-gray-400">Adresse :</span> <span className="font-semibold text-navy">{addrLabel}</span></div>
                <div><span className="text-gray-400">Loyer HT :</span> <span className="font-semibold text-navy">{fmt(d.loyer_mensuel)}/mois</span></div>
                <div><span className="text-gray-400">Charges :</span> <span className="font-semibold text-navy">{fmt(d.charges)}/mois</span></div>
                <div><span className="text-gray-400">Type :</span> <span className="font-semibold text-navy capitalize">{d.type_bail || '—'}</span></div>
                <div><span className="text-gray-400">Début :</span> <span className="font-semibold text-navy">{d.date_debut ? fmtDate(d.date_debut) : '—'}</span></div>
              </div>
            </div>

            {/* Rattacher à un bien */}
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Rattacher à un bien</h4>
            <div className="space-y-2 mb-2">
              {biens.map(b => (
                <label key={b.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${w.bien_id === b.id ? 'bg-blue-50 border border-blue-300' : 'bg-gray-50 hover:bg-gray-100 border border-transparent'}`}>
                  <input type="radio" name="wiz_bien" checked={w.bien_id === b.id}
                    onChange={() => setBailWizard(p => ({ ...p, bien_id: b.id, createBien: false }))} className="accent-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-navy">{b.reference || b.adresse}</p>
                    <p className="text-xs text-gray-400">{b.adresse}, {b.code_postal} {b.ville}</p>
                  </div>
                </label>
              ))}
              <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${w.createBien ? 'bg-emerald-50 border border-emerald-300' : 'bg-gray-50 hover:bg-gray-100 border border-transparent'}`}>
                <input type="radio" name="wiz_bien" checked={w.createBien}
                  onChange={() => setBailWizard(p => ({ ...p, bien_id: '', createBien: true }))} className="accent-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-emerald-700"><Plus size={12} className="inline mr-1" />Créer un nouveau bien</p>
                  <p className="text-xs text-gray-400">Avec les données extraites : {addrLabel}</p>
                </div>
              </label>
            </div>

            {/* Rattacher à un locataire */}
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 mt-5">Rattacher à un locataire</h4>
            <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
              {locataires.map(l => (
                <label key={l.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${w.locataire_id === l.id ? 'bg-blue-50 border border-blue-300' : 'bg-gray-50 hover:bg-gray-100 border border-transparent'}`}>
                  <input type="radio" name="wiz_loc" checked={w.locataire_id === l.id}
                    onChange={() => setBailWizard(p => ({ ...p, locataire_id: l.id, createLoc: false }))} className="accent-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-navy">{l.raison_sociale || `${l.prenom || ''} ${l.nom || ''}`.trim() || '—'}</p>
                    <p className="text-xs text-gray-400">{l.email || '—'}</p>
                  </div>
                </label>
              ))}
              <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${w.createLoc ? 'bg-emerald-50 border border-emerald-300' : 'bg-gray-50 hover:bg-gray-100 border border-transparent'}`}>
                <input type="radio" name="wiz_loc" checked={w.createLoc}
                  onChange={() => setBailWizard(p => ({ ...p, locataire_id: '', createLoc: true }))} className="accent-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-emerald-700"><Plus size={12} className="inline mr-1" />Créer un nouveau locataire</p>
                  <p className="text-xs text-gray-400">Avec les données extraites : {locLabel}</p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Btn variant="ghost" onClick={() => setBailWizard(null)}>Annuler</Btn>
              <Btn onClick={saveBailWizard} disabled={!w.bien_id && !w.createBien || !w.locataire_id && !w.createLoc}>
                <CheckCircle size={14} className="mr-1" /> Créer le bail
              </Btn>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}
