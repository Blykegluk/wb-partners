import { useState } from 'react'
import { Building2, Plus, Trash2, ExternalLink, Upload, MapPin, Zap, FileText, Users, FolderOpen, ArrowRight } from 'lucide-react'
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
  const { biens, baux, locataires, documents, transactions, selected, canEdit, reload } = useSociete()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(null)
  const [f, setF] = useState(EMPTY_BIEN)
  const [ui, setUi] = useState(EMPTY_UI)
  const [detail, setDetail] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')

  const openNew = () => { setEdit(null); setF(EMPTY_BIEN); setUi(EMPTY_UI); setExtractError(''); setOpen(true) }
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

  // ── Extraction IA ─────────────────────────────────────────
  const handleExtract = async (file) => {
    setExtracting(true)
    setExtractError('')
    try {
      const base64 = await fileToBase64(file)
      const result = await extractFromPDF(base64, file.type || 'application/pdf')

      if (result.type === 'bail') {
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
      } else if (result.type === 'amortissement') {
        setF(p => ({
          ...p,
          montant_emprunt: result.montant_emprunt ?? p.montant_emprunt,
          duree_credit: result.duree_credit ?? p.duree_credit,
          annuites: result.annuites ?? p.annuites,
          decalage_pret: result.decalage_pret ?? p.decalage_pret,
        }))
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
        {canEdit && <Btn onClick={openNew}><Plus size={15} /> Ajouter un bien</Btn>}
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
                        <button onClick={() => navigate('baux', { openNew: true, bien_id: b.id })}
                          className="text-xs text-blue-500 hover:text-blue-700 font-semibold cursor-pointer flex items-center gap-1">
                          <Plus size={12} /> Nouveau bail
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
                    <p className="text-sm text-gray-300 italic">Aucun bail — {canEdit && <button onClick={() => navigate('baux', { openNew: true, bien_id: b.id })} className="text-blue-500 hover:underline cursor-pointer">créer un bail</button>}</p>
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
                  <div className="mt-5 pt-4 border-t border-gray-100 flex gap-2">
                    <Btn className="!text-xs !px-3 !py-1.5" onClick={() => navigate('baux', { openNew: true, bien_id: b.id })}>
                      <Plus size={13} /> Nouveau bail
                    </Btn>
                    <Btn className="!text-xs !px-3 !py-1.5" variant="ghost" onClick={() => navigate('locataires', { openNew: true })}>
                      <Plus size={13} /> Nouveau locataire
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
    </div>
  )
}
