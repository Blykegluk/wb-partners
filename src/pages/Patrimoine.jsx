import { useState } from 'react'
import { Building2, Plus, Trash2, Upload, MapPin, FileText, Users, FolderOpen, Receipt, ArrowRight, Link, Euro, ChevronLeft, Download, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { fmt, fmtDate, googleMapsUrl, DOC_TYPES } from '../lib/utils'
import { rendementBrut, rendementNet, cashflowMensuel } from '../lib/calculs'
import SmartUpload from '../components/SmartUpload'
import { PageHeader, Card, Modal, Field, Sel, Check, Grid2, Grid3, Btn, Badge, Empty, AddressField } from '../components/UI'

const EMPTY_BIEN = {
  reference: '', adresse: '', ville: '', code_postal: '', latitude: null, longitude: null,
  surface_rdc: '', surface_sous_sol: '', type: 'Commercial', activite: '',
  type_bail: 'commercial', attribution_charges: '', indexation: 'ILC',
  prix_achat: '', frais_notaire_pct: '', frais_notaire: '', apport: '', montant_emprunt: '', duree_credit: '', decalage_pret: '',
  loyer_mensuel: '', charges: '', annuites: '',
  date_acquisition: '', presence_extraction: false, taxe_fonciere: '', statut_bien: 'Actif',
}

const EMPTY_UI = { apport_mode: 'euro', apport_pct: '', duree_mode: 'annees', duree_annees: '' }

const EMPTY_BAIL = {
  bien_id: '', locataire_id: '', date_debut: '', date_fin: '',
  loyer_ht: '', loyer_an1: '', loyer_an2: '', charges: '', depot: '',
  type_bail: 'commercial', utilisation: '', indice_revision: 'ILC',
  date_revision_anniversaire: '', actif: true,
}

const EMPTY_LOC = { raison_sociale: '', prenom: '', nom: '', email: '', telephone: '' }

const TABS = [
  { key: 'infos', label: 'Infos', icon: Building2 },
  { key: 'baux', label: 'Baux & Locataires', icon: Users },
  { key: 'documents', label: 'Documents', icon: FolderOpen },
  { key: 'charges', label: 'Charges', icon: Receipt },
]

export default function Patrimoine({ navigate }) {
  const { biens, baux, locataires, documents, transactions, appelsCharges, selected, canEdit, reload } = useSociete()

  const [detailId, setDetailId] = useState(null)
  const [tab, setTab] = useState('infos')
  const [showUpload, setShowUpload] = useState(false)
  const [uploadBienId, setUploadBienId] = useState(null)

  // Bien modal
  const [editBien, setEditBien] = useState(null)
  const [bienModal, setBienModal] = useState(false)
  const [f, setF] = useState(EMPTY_BIEN)
  const [ui, setUi] = useState(EMPTY_UI)
  const [saveError, setSaveError] = useState('')

  // Bail modal
  const [editBail, setEditBail] = useState(null)
  const [bailModal, setBailModal] = useState(false)
  const [bf, setBf] = useState(EMPTY_BAIL)
  const [bailError, setBailError] = useState('')

  // New locataire inline
  const [newLocModal, setNewLocModal] = useState(false)
  const [lf, setLf] = useState(EMPTY_LOC)
  const [locError, setLocError] = useState('')

  // ── Helpers ───────────────────────────────────────────────
  const detail = biens.find(b => b.id === detailId)
  const getBienBaux = (id) => baux.filter(b => b.bien_id === id)
  const getBienDocs = (id) => documents.filter(d => d.bien_id === id)
  const getBienCharges = (id) => appelsCharges.filter(ac => ac.bien_id === id)
  const getBienImpayes = (id) => {
    const bailIds = getBienBaux(id).map(ba => ba.id)
    return transactions.filter(t => bailIds.includes(t.bail_id) && t.statut === 'impayé')
  }

  const rb = (b) => { const r = rendementBrut(b); return r !== null ? (r * 100).toFixed(1) + '%' : '—' }
  const rn = (b) => { const r = rendementNet(b); return r !== null ? (r * 100).toFixed(1) + '%' : '—' }
  const cf = (b) => cashflowMensuel(b)

  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  const num = (k, v) => u(k, v === '' ? '' : v)

  // ── Live computed values (bien form) ──────────────────────
  const prixAchat = Number(f.prix_achat) || 0
  const fraisNotaire = f.frais_notaire !== '' ? Number(f.frais_notaire) || 0
    : f.frais_notaire_pct !== '' ? Math.round(prixAchat * (Number(f.frais_notaire_pct) / 100)) : 0
  const coutTotal = prixAchat + fraisNotaire
  const apportCalc = ui.apport_mode === 'pct'
    ? Math.round(prixAchat * (Number(ui.apport_pct) / 100))
    : Number(f.apport) || 0
  const empruntCalc = Math.max(0, coutTotal - apportCalc)

  // ── Bien CRUD ─────────────────────────────────────────────
  const openNewBien = () => {
    setEditBien(null)
    setF(EMPTY_BIEN)
    setUi(EMPTY_UI)
    setSaveError('')
    setBienModal(true)
  }

  const openEditBien = (b) => {
    setEditBien(b)
    setF({ ...EMPTY_BIEN, ...b })
    const da = b.duree_credit ? Math.round(b.duree_credit / 12) : ''
    setUi({ ...EMPTY_UI, duree_annees: da, duree_mode: 'annees' })
    setSaveError('')
    setBienModal(true)
  }

  const saveBien = async () => {
    setSaveError('')
    if (!f.adresse?.trim() || !f.ville?.trim()) {
      setSaveError('Adresse et ville sont obligatoires.')
      return
    }
    const data = { ...f }
    data.apport = apportCalc || null
    data.montant_emprunt = empruntCalc || null
    data.frais_notaire = fraisNotaire || null
    for (const k of ['surface_rdc','surface_sous_sol','prix_achat','apport','montant_emprunt','duree_credit','decalage_pret','loyer_mensuel','charges','annuites','taxe_fonciere','latitude','longitude','frais_notaire','frais_notaire_pct']) {
      data[k] = data[k] === '' || data[k] === null || data[k] === undefined ? null : Number(data[k])
    }
    data.presence_extraction = !!data.presence_extraction
    delete data.id; delete data.created_at; delete data._role
    delete data.charges_refacturables; delete data.charges_non_refacturables

    let error
    if (editBien) {
      ({ error } = await supabase.from('biens').update(data).eq('id', editBien.id))
    } else {
      ({ error } = await supabase.from('biens').insert({ ...data, societe_id: selected.id }))
    }
    if (error) {
      setSaveError(error.message || 'Erreur lors de la sauvegarde.')
      return
    }
    setBienModal(false)
    reload()
  }

  const delBien = async (id) => {
    if (!confirm('Supprimer ce bien et toutes ses données associées ?')) return
    const { error } = await supabase.from('biens').delete().eq('id', id)
    if (error) { alert(error.message); return }
    if (detailId === id) setDetailId(null)
    reload()
  }

  // ── Bail CRUD ─────────────────────────────────────────────
  const openNewBail = (bienId) => {
    setEditBail(null)
    setBf({ ...EMPTY_BAIL, bien_id: bienId })
    setBailError('')
    setBailModal(true)
  }

  const openEditBail = (bail) => {
    setEditBail(bail)
    setBf({ ...EMPTY_BAIL, ...bail })
    setBailError('')
    setBailModal(true)
  }

  const saveBail = async () => {
    setBailError('')
    if (!bf.locataire_id || !bf.loyer_ht) {
      setBailError('Locataire et loyer HT sont obligatoires.')
      return
    }
    const data = { ...bf }
    for (const k of ['loyer_ht','loyer_an1','loyer_an2','charges','depot']) {
      data[k] = data[k] === '' || data[k] === null ? null : Number(data[k])
    }
    data.actif = Boolean(data.actif)
    delete data.id; delete data.created_at

    let error
    if (editBail) {
      ({ error } = await supabase.from('baux').update(data).eq('id', editBail.id))
    } else {
      ({ error } = await supabase.from('baux').insert({ ...data, societe_id: selected.id }))
    }
    if (error) {
      setBailError(error.message || 'Erreur lors de la sauvegarde.')
      return
    }
    setBailModal(false)
    reload()
  }

  const delBail = async (id) => {
    if (!confirm('Supprimer ce bail ?')) return
    const { error } = await supabase.from('baux').delete().eq('id', id)
    if (error) { alert(error.message); return }
    reload()
  }

  // ── New locataire (inline from bail modal) ────────────────
  const saveNewLoc = async () => {
    setLocError('')
    if (!lf.raison_sociale && !lf.nom) {
      setLocError('Raison sociale ou nom obligatoire.')
      return
    }
    const data = { ...lf }
    const { data: inserted, error } = await supabase.from('locataires').insert({ ...data, societe_id: selected.id }).select().single()
    if (error) {
      setLocError(error.message || 'Erreur lors de la création.')
      return
    }
    if (inserted) setBf(p => ({ ...p, locataire_id: inserted.id }))
    setNewLocModal(false)
    reload()
  }

  // ── Document delete ───────────────────────────────────────
  const delDoc = async (id) => {
    if (!confirm('Supprimer ce document ?')) return
    const { error } = await supabase.from('documents').delete().eq('id', id)
    if (error) { alert(error.message); return }
    reload()
  }

  // ── SmartUpload opener ────────────────────────────────────
  const openUpload = (bienId = null) => {
    setUploadBienId(bienId)
    setShowUpload(true)
  }

  // ══════════════════════════════════════════════════════════
  // DETAIL VIEW
  // ══════════════════════════════════════════════════════════
  if (detail) {
    const bienBaux = getBienBaux(detail.id)
    const bienDocs = getBienDocs(detail.id)
    const bienCharges = getBienCharges(detail.id)
    const totalRef = detail.charges_refacturables || 0
    const totalNonRef = detail.charges_non_refacturables || 0

    return (
      <div>
        {/* Back + Header */}
        <button onClick={() => { setDetailId(null); setTab('infos') }}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-navy font-medium cursor-pointer mb-4 transition-colors">
          <ChevronLeft size={16} /> Patrimoine
        </button>

        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-extrabold text-navy">{detail.reference || detail.adresse}</h1>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{detail.type}</span>
              {detail.statut_bien && detail.statut_bien !== 'Actif' && (
                <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">{detail.statut_bien}</span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <MapPin size={13} />
                <a href={googleMapsUrl(detail.adresse, detail.ville, detail.code_postal)} target="_blank" rel="noreferrer"
                  className="hover:text-blue-500 hover:underline">
                  {detail.adresse}, {detail.code_postal} {detail.ville}
                </a>
              </span>
            </div>
            {/* Key financials row */}
            <div className="flex items-center gap-6 mt-3">
              <div><span className="text-xs text-gray-400">Loyer</span> <span className="font-bold text-navy ml-1">{fmt(detail.loyer_mensuel)}</span></div>
              <div><span className="text-xs text-gray-400">Rdt brut</span> <span className="font-bold text-emerald-600 ml-1">{rb(detail)}</span></div>
              <div><span className="text-xs text-gray-400">Rdt net</span> <span className="font-bold text-blue-600 ml-1">{rn(detail)}</span></div>
              <div><span className="text-xs text-gray-400">Cashflow</span> <span className={`font-bold ml-1 ${cf(detail) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(cf(detail))}</span></div>
            </div>
          </div>
          <Btn variant="green" onClick={() => openUpload(detail.id)}>
            <Upload size={15} /> SmartUpload
          </Btn>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold cursor-pointer transition-colors border-b-2 -mb-px ${
                tab === t.key ? 'border-navy text-navy' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: Infos ─────────────────────────────────────── */}
        {tab === 'infos' && (
          <div>
            <Card className="p-6">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-sm font-bold text-navy uppercase tracking-wide">Informations du bien</h3>
                {canEdit && (
                  <Btn className="!text-xs !px-3 !py-1.5" onClick={() => openEditBien(detail)}>Modifier</Btn>
                )}
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div><p className="text-gray-400 text-xs mb-1">Prix d'achat</p><p className="font-semibold text-navy">{fmt(detail.prix_achat)}</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Frais de notaire</p><p className="font-semibold text-navy">{fmt(detail.frais_notaire)}</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Apport</p><p className="font-semibold text-navy">{fmt(detail.apport)}</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Emprunt</p><p className="font-semibold text-navy">{fmt(detail.montant_emprunt)}</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Durée crédit</p><p className="font-semibold text-navy">{detail.duree_credit ? `${detail.duree_credit} mois` : '—'}</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Différé prêt</p><p className="font-semibold text-navy">{detail.decalage_pret ? `${detail.decalage_pret} mois` : '—'}</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Annuités</p><p className="font-semibold text-navy">{fmt(detail.annuites)}/mois</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Charges</p><p className="font-semibold text-navy">{fmt(detail.charges)}/mois</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Taxe foncière</p><p className="font-semibold text-navy">{fmt(detail.taxe_fonciere)}/an</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Type bail</p><p className="font-semibold text-navy capitalize">{detail.type_bail || '—'}</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Indexation</p><p className="font-semibold text-navy">{detail.indexation || '—'}</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Attrib. charges</p><p className="font-semibold text-navy">{detail.attribution_charges || '—'}</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Surface RDC</p><p className="font-semibold text-navy">{detail.surface_rdc ? `${detail.surface_rdc} m²` : '—'}</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Surface sous-sol</p><p className="font-semibold text-navy">{detail.surface_sous_sol ? `${detail.surface_sous_sol} m²` : '—'}</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Date acquisition</p><p className="font-semibold text-navy">{fmtDate(detail.date_acquisition)}</p></div>
                <div><p className="text-gray-400 text-xs mb-1">Extraction VMC</p><p className="font-semibold text-navy">{detail.presence_extraction ? 'Oui' : 'Non'}</p></div>
              </div>
              {/* Rendements */}
              <div className="mt-5 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4">
                <div className="bg-emerald-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-emerald-600 font-semibold uppercase mb-1">Rendement brut</p>
                  <p className="text-2xl font-bold text-emerald-700">{rb(detail)}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-blue-600 font-semibold uppercase mb-1">Rendement net</p>
                  <p className="text-2xl font-bold text-blue-700">{rn(detail)}</p>
                </div>
                <div className={`rounded-lg p-4 text-center ${cf(detail) >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <p className={`text-xs font-semibold uppercase mb-1 ${cf(detail) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Cashflow mensuel</p>
                  <p className={`text-2xl font-bold ${cf(detail) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(cf(detail))}</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ── TAB: Baux & Locataires ─────────────────────────── */}
        {tab === 'baux' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                Baux ({bienBaux.length})
              </h3>
              {canEdit && (
                <Btn className="!text-xs" onClick={() => openNewBail(detail.id)}>
                  <Plus size={13} /> Nouveau bail
                </Btn>
              )}
            </div>

            {bienBaux.length === 0 ? (
              <Empty icon={<FileText size={40} />} text="Aucun bail pour ce bien." />
            ) : (
              <div className="space-y-3">
                {bienBaux.map(ba => {
                  const loc = locataires.find(l => l.id === ba.locataire_id)
                  const nimp = transactions.filter(t => t.bail_id === ba.id && t.statut === 'impayé').length
                  return (
                    <Card key={ba.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                            <Users size={18} className="text-gray-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-navy text-sm">
                              {loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || '—'}
                            </p>
                            <p className="text-xs text-gray-400">
                              {fmtDate(ba.date_debut)} → {ba.date_fin ? fmtDate(ba.date_fin) : '∞'}
                              <span className="ml-2 capitalize">{ba.type_bail}</span>
                              {ba.indice_revision && <span className="ml-2">Indice: {ba.indice_revision}</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold text-navy text-sm">{fmt(ba.loyer_ht)}/mois</p>
                            {ba.charges > 0 && <p className="text-xs text-gray-400">+ {fmt(ba.charges)} charges</p>}
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ba.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                            {ba.actif ? 'Actif' : 'Inactif'}
                          </span>
                          {nimp > 0 && (
                            <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                              {nimp} impayé{nimp > 1 ? 's' : ''}
                            </span>
                          )}
                          {canEdit && (
                            <div className="flex gap-2">
                              <button onClick={() => openEditBail(ba)} className="text-gray-300 hover:text-blue-500 cursor-pointer text-xs font-medium">Modifier</button>
                              <button onClick={() => delBail(ba.id)} className="text-gray-300 hover:text-red-500 cursor-pointer"><Trash2 size={15} /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Documents ─────────────────────────────────── */}
        {tab === 'documents' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                Documents ({bienDocs.length})
              </h3>
              {canEdit && (
                <Btn variant="green" className="!text-xs" onClick={() => openUpload(detail.id)}>
                  <Upload size={13} /> SmartUpload
                </Btn>
              )}
            </div>

            {bienDocs.length === 0 ? (
              <Empty icon={<FolderOpen size={40} />} text="Aucun document pour ce bien." />
            ) : (
              <div className="space-y-2">
                {bienDocs.map(d => {
                  const ti = DOC_TYPES.find(t => t.v === d.type) || { l: d.type, color: '#64748b' }
                  return (
                    <Card key={d.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: ti.color }} />
                          <div>
                            <p className="text-sm font-semibold text-navy">{d.nom}</p>
                            <p className="text-xs text-gray-400">{ti.l} — {fmtDate(d.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a href={d.fichier_url} target="_blank" rel="noreferrer"
                            className="text-gray-300 hover:text-blue-500 cursor-pointer">
                            <Download size={16} />
                          </a>
                          {canEdit && (
                            <button onClick={() => delDoc(d.id)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Charges ───────────────────────────────────── */}
        {tab === 'charges' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                Charges ({bienCharges.length} appel{bienCharges.length > 1 ? 's' : ''})
              </h3>
              {canEdit && (
                <Btn variant="green" className="!text-xs" onClick={() => openUpload(detail.id)}>
                  <Upload size={13} /> SmartUpload
                </Btn>
              )}
            </div>

            {/* Summary cards */}
            {(totalRef > 0 || totalNonRef > 0) && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-emerald-50 rounded-lg p-4">
                  <p className="text-[11px] text-emerald-600 font-semibold uppercase">Refacturables</p>
                  <p className="text-xl font-bold text-emerald-700">{fmt(totalRef)}<span className="text-xs font-normal">/an</span></p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-[11px] text-red-600 font-semibold uppercase">Non refacturables</p>
                  <p className="text-xl font-bold text-red-600">{fmt(totalNonRef)}<span className="text-xs font-normal">/an</span></p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-[11px] text-gray-500 font-semibold uppercase">Total charges</p>
                  <p className="text-xl font-bold text-navy">{fmt(totalRef + totalNonRef)}<span className="text-xs font-normal">/an</span></p>
                </div>
              </div>
            )}

            {bienCharges.length === 0 && totalRef === 0 && totalNonRef === 0 ? (
              <Empty icon={<Receipt size={40} />} text="Aucun appel de charges." />
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Période</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Montant total</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Refacturable</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Non refacturable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bienCharges.map(ac => (
                      <tr key={ac.id} className="border-t border-gray-50">
                        <td className="px-4 py-3 text-sm text-navy font-medium">{ac.periode || 'Sans période'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-navy text-right">{fmt(ac.montant_total)}</td>
                        <td className="px-4 py-3 text-sm text-emerald-600 text-right">{fmt(ac.charges_refacturables)}</td>
                        <td className="px-4 py-3 text-sm text-red-500 text-right">{fmt(ac.charges_non_refacturables)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        )}

        {/* SmartUpload overlay */}
        {showUpload && (
          <SmartUpload onClose={() => { setShowUpload(false); reload() }} bienId={uploadBienId} />
        )}

        {/* Modals rendered below */}
        {renderBienModal()}
        {renderBailModal()}
        {renderLocModal()}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════
  // LIST VIEW
  // ══════════════════════════════════════════════════════════

  function renderListView() {
    return (
      <div>
        <PageHeader title="Patrimoine" sub="Vue consolidée de vos biens immobiliers">
          {canEdit && (
            <>
              <Btn variant="green" onClick={() => openUpload()}>
                <Upload size={15} /> SmartUpload
              </Btn>
              <Btn onClick={openNewBien}>
                <Plus size={15} /> Ajouter un bien
              </Btn>
            </>
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
                <Card key={b.id} className="p-5 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 cursor-pointer" onClick={() => { setDetailId(b.id); setTab('infos') }}>
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
                          <span>{b.adresse}, {b.code_postal} {b.ville}</span>
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
                        {canEdit && <button onClick={(e) => { e.stopPropagation(); openEditBien(b) }} className="text-gray-300 hover:text-blue-500 cursor-pointer text-xs font-medium">Modifier</button>}
                        {canEdit && <button onClick={(e) => { e.stopPropagation(); delBien(b.id) }} className="text-gray-300 hover:text-red-500 cursor-pointer"><Trash2 size={15} /></button>}
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {/* SmartUpload overlay */}
        {showUpload && (
          <SmartUpload onClose={() => { setShowUpload(false); reload() }} bienId={uploadBienId} />
        )}

        {/* Modals */}
        {renderBienModal()}
        {renderBailModal()}
        {renderLocModal()}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════
  // BIEN MODAL
  // ══════════════════════════════════════════════════════════

  function renderBienModal() {
    if (!bienModal) return null
    return (
      <Modal title={editBien ? 'Modifier le bien' : 'Nouveau bien'} onClose={() => setBienModal(false)} width="max-w-3xl">
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

        {/* Bail info */}
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
          <Field label="Prix d'achat (EUR)" type="number" value={f.prix_achat} onChange={e => {
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
            <input type="number" placeholder="Montant (EUR)"
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
                EUR
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
              <input type="number" placeholder="Montant (EUR)"
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
          <Field label="Annuités (EUR/mois)" type="number" value={f.annuites} onChange={e => num('annuites', e.target.value)} />
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
          <Field label="Taxe foncière (EUR/an)" type="number" value={f.taxe_fonciere} onChange={e => num('taxe_fonciere', e.target.value)} />
        </Grid3>
        <Grid3>
          <Field label="Loyer mensuel (EUR)" type="number" value={f.loyer_mensuel} onChange={e => num('loyer_mensuel', e.target.value)} />
          <Field label="Charges (EUR/mois)" type="number" value={f.charges} onChange={e => num('charges', e.target.value)} />
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
          <Btn variant="ghost" onClick={() => setBienModal(false)}>Annuler</Btn>
          <Btn onClick={saveBien}>{editBien ? 'Enregistrer' : 'Ajouter'}</Btn>
        </div>
      </Modal>
    )
  }

  // ══════════════════════════════════════════════════════════
  // BAIL MODAL
  // ══════════════════════════════════════════════════════════

  function renderBailModal() {
    if (!bailModal) return null
    const bienName = (() => {
      const b = biens.find(x => x.id === bf.bien_id)
      return b?.reference || b?.adresse || '—'
    })()

    return (
      <Modal title={editBail ? 'Modifier le bail' : 'Nouveau bail'} onClose={() => setBailModal(false)} width="max-w-2xl">
        <Grid2>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Bien</label>
            <div className="px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-navy">
              {bienName}
            </div>
          </div>
          <div>
            <Sel label="Locataire *" value={bf.locataire_id} onChange={e => setBf(p => ({ ...p, locataire_id: e.target.value }))}
              options={[{ v: '', l: 'Sélectionner un locataire' }, ...locataires.map(l => ({ v: l.id, l: l.raison_sociale || `${l.prenom} ${l.nom}` }))]} />
            <button onClick={() => { setLf(EMPTY_LOC); setLocError(''); setNewLocModal(true) }}
              className="text-xs text-blue-500 hover:underline cursor-pointer -mt-1 flex items-center gap-1">
              <Plus size={11} /> Créer un nouveau locataire
            </button>
          </div>
        </Grid2>

        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 mt-4">Loyers (progressif)</h4>
        <Grid3>
          <Field label="Loyer HT (palier final) *" type="number" value={bf.loyer_ht} onChange={e => setBf(p => ({ ...p, loyer_ht: e.target.value }))} />
          <Field label="Loyer An 1" type="number" placeholder="Si progressif" value={bf.loyer_an1 || ''} onChange={e => setBf(p => ({ ...p, loyer_an1: e.target.value }))} />
          <Field label="Loyer An 2" type="number" placeholder="Si progressif" value={bf.loyer_an2 || ''} onChange={e => setBf(p => ({ ...p, loyer_an2: e.target.value }))} />
        </Grid3>
        <Grid3>
          <Field label="Charges (EUR/mois)" type="number" value={bf.charges} onChange={e => setBf(p => ({ ...p, charges: e.target.value }))} />
          <Field label="Dépôt de garantie (EUR)" type="number" value={bf.depot} onChange={e => setBf(p => ({ ...p, depot: e.target.value }))} />
          <Sel label="Type de bail" value={bf.type_bail} onChange={e => setBf(p => ({ ...p, type_bail: e.target.value }))}
            options={[{v:'commercial',l:'Commercial'},{v:'professionnel',l:'Professionnel'},{v:'habitation',l:'Habitation'}]} />
        </Grid3>

        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 mt-4">Dates & révision</h4>
        <Grid3>
          <Field label="Date début" type="date" value={bf.date_debut || ''} onChange={e => setBf(p => ({ ...p, date_debut: e.target.value }))} />
          <Field label="Date fin" type="date" value={bf.date_fin || ''} onChange={e => setBf(p => ({ ...p, date_fin: e.target.value }))} />
          <Field label="Date révision anniversaire" type="date" value={bf.date_revision_anniversaire || ''} onChange={e => setBf(p => ({ ...p, date_revision_anniversaire: e.target.value }))} />
        </Grid3>
        <Grid2>
          <Sel label="Indice de révision" value={bf.indice_revision} onChange={e => setBf(p => ({ ...p, indice_revision: e.target.value }))}
            options={[{v:'ILC',l:'ILC'},{v:'ICC',l:'ICC'},{v:'IRL',l:'IRL'}]} />
          <Field label="Utilisation" placeholder="ex: Restauration" value={bf.utilisation} onChange={e => setBf(p => ({ ...p, utilisation: e.target.value }))} />
        </Grid2>

        <Check label="Bail actif" checked={bf.actif || false} onChange={e => setBf(p => ({ ...p, actif: e.target.checked }))} />

        {bailError && <p className="text-red-500 text-sm mt-2">{bailError}</p>}
        <div className="flex justify-end gap-3 mt-6">
          <Btn variant="ghost" onClick={() => setBailModal(false)}>Annuler</Btn>
          <Btn onClick={saveBail} disabled={!bf.locataire_id || !bf.loyer_ht}>
            {editBail ? 'Enregistrer' : 'Créer le bail'}
          </Btn>
        </div>
      </Modal>
    )
  }

  // ══════════════════════════════════════════════════════════
  // NEW LOCATAIRE MODAL
  // ══════════════════════════════════════════════════════════

  function renderLocModal() {
    if (!newLocModal) return null
    return (
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

        {locError && <p className="text-red-500 text-sm mt-2">{locError}</p>}
        <div className="flex justify-end gap-3 mt-6">
          <Btn variant="ghost" onClick={() => setNewLocModal(false)}>Annuler</Btn>
          <Btn onClick={saveNewLoc} disabled={!lf.raison_sociale && !lf.nom}>Créer</Btn>
        </div>
      </Modal>
    )
  }

  // ── Main render ───────────────────────────────────────────
  return renderListView()
}
