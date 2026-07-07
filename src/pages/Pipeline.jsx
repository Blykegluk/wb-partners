import { useState, useEffect, useMemo } from 'react'
import {
  Radar, ExternalLink, MessageSquare, Send, MapPin, Sparkles,
  SlidersHorizontal, Store, Hotel, KeyRound,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/Auth'
import { Card, Modal, Btn, Sel, Field, Empty, Spinner, PageHeader } from '../components/UI'
import { fmt, fmtDate } from '../lib/utils'

// ── Config ───────────────────────────────────────────────────

const RECHERCHES = {
  R1: { label: 'Murs commerciaux', sub: 'Rendement patrimonial', I: KeyRound },
  R2: { label: 'Conversion hôtelière', sub: 'Immeubles à rénover', I: Hotel },
  R3: { label: 'Supermarché', sub: 'Bio ou conventionnel', I: Store },
}

const STATUTS = [
  { v: 'active', l: 'Active', cls: 'bg-blue-100 text-blue-700' },
  { v: 'a_visiter', l: 'À visiter', cls: 'bg-indigo-100 text-indigo-700' },
  { v: 'offre_deposee', l: 'Offre déposée', cls: 'bg-purple-100 text-purple-700' },
  { v: 'en_nego', l: 'En négo', cls: 'bg-amber-100 text-amber-700' },
  { v: 'signee', l: 'Signée', cls: 'bg-green-100 text-green-700' },
  { v: 'abandonnee', l: 'Abandonnée', cls: 'bg-gray-100 text-gray-500' },
  { v: 'expiree', l: 'Expirée', cls: 'bg-gray-100 text-gray-400' },
]
const STATUTS_TRAVAIL = ['active', 'a_visiter', 'offre_deposee', 'en_nego', 'signee']

const statutCfg = (v) => STATUTS.find(s => s.v === v) || { l: v, cls: 'bg-gray-100 text-gray-500' }

const isNouveau = (o) => o.detecte_le && (Date.now() - new Date(o.detecte_le).getTime()) < 48 * 3600 * 1000

const fmtNum = (n) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)

// ── Petits composants ────────────────────────────────────────

function ScoreBadge({ score, size = 'sm' }) {
  if (score == null) return <span className="text-gray-300 text-xs">—</span>
  const cls = score >= 70 ? 'bg-green-100 text-green-700' : score >= 50 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
  const dim = size === 'lg' ? 'w-14 h-14 text-xl' : 'w-10 h-10 text-sm'
  return (
    <span className={`${cls} ${dim} rounded-full font-extrabold inline-flex items-center justify-center shrink-0`}>
      {score}
    </span>
  )
}

function VerdictBadge({ verdict }) {
  if (!verdict) return null
  const v = verdict.toLowerCase()
  const cls = v.startsWith('favorable') ? 'bg-green-100 text-green-700'
    : v.startsWith('incertain') ? 'bg-orange-100 text-orange-700'
    : v.startsWith('défavorable') || v.startsWith('defavorable') ? 'bg-red-100 text-red-700'
    : 'bg-gray-100 text-gray-500'
  return <span className={`${cls} px-2 py-0.5 rounded-full text-[11px] font-semibold`}>{verdict.split(/[—:-]/)[0].trim()}</span>
}

function Row({ label, children }) {
  if (children == null || children === '' || children === '—') return null
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-gray-50 text-sm">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-800 text-right font-medium">{children}</span>
    </div>
  )
}

// ── Carte opportunité ────────────────────────────────────────

function OppCard({ o, onOpen }) {
  const s = statutCfg(o.statut)
  return (
    <Card className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => onOpen(o)}>
      <div className="flex items-start gap-3">
        <ScoreBadge score={o.score} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            {isNouveau(o) && (
              <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1">
                <Sparkles size={9} />NOUVEAU
              </span>
            )}
            {o.hors_critere && (
              <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-bold">HORS CRITÈRES</span>
            )}
            {o.statut !== 'active' && <span className={`${s.cls} px-1.5 py-0.5 rounded text-[10px] font-semibold`}>{s.l}</span>}
            {o.recherche === 'R2' && <VerdictBadge verdict={o.verdict_reglementaire} />}
          </div>
          <p className="font-bold text-navy text-sm truncate">{o.adresse || 'Adresse à confirmer'}</p>
          <p className="text-gray-400 text-xs flex items-center gap-1">
            <MapPin size={11} className="shrink-0" />{o.code_postal} {o.ville}
            {o.type_offre === 'location' && <span className="ml-1 text-indigo-500 font-semibold">· Location</span>}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-navy font-extrabold">
          {o.type_offre === 'location'
            ? (o.loyer_annuel ? `${fmtNum(o.loyer_annuel)} €/an` : (o.hors_critere ? 'Loyer : nous consulter' : '—'))
            : (o.prix ? fmtNum(o.prix) + ' €' : (o.hors_critere ? 'Prix : nous consulter' : '—'))}
        </span>
        <span className="text-gray-400 text-xs">
          {o.surface_totale ? `${fmtNum(o.surface_totale)} m²` : ''}
          {o.prix_m2 ? ` · ${fmtNum(o.prix_m2)} €/m²` : ''}
        </span>
      </div>

      {/* Infos clés par recherche */}
      <div className="mt-2 text-xs text-gray-500 space-y-0.5">
        {o.recherche === 'R1' && (
          <>
            {o.rendement_brut != null && (
              <p><span className={`font-bold ${o.rendement_brut >= 8 ? 'text-green-600' : 'text-orange-500'}`}>{String(o.rendement_brut).replace('.', ',')} % brut</span>{o.occupation ? ` · ${o.occupation}` : ''}</p>
            )}
            {o.locataire && <p className="truncate">Locataire : {o.locataire}</p>}
            {o.garanties && <p className="truncate">Garanties : {o.garanties}</p>}
          </>
        )}
        {o.recherche === 'R2' && o.surface_detail && <p className="truncate">Config : {o.surface_detail}</p>}
        {o.recherche === 'R3' && (
          <>
            {o.ca_potentiel?.central && <p>CA potentiel : <span className="font-semibold text-gray-700">{fmtNum(o.ca_potentiel.central)} €/an</span>{o.ca_potentiel.recommandation ? ` · reco ${o.ca_potentiel.recommandation}` : ''}</p>}
            {o.ratio_cle && <p>{o.ratio_cle}</p>}
            {Array.isArray(o.analyse_concurrence?.concurrents) && <p>{o.analyse_concurrence.concurrents.length} concurrent(s) recensé(s)</p>}
          </>
        )}
        {o.points_forts && <p className="text-green-600 truncate">+ {o.points_forts}</p>}
      </div>

      {o.hors_critere && o.motif_hors_critere && (
        <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
          {o.motif_hors_critere}
        </p>
      )}

      <div className="mt-3 pt-2 border-t border-gray-50 flex items-center justify-between">
        <span className="text-gray-300 text-[11px]">{o.source} · détecté le {fmtDate(o.detecte_le)}</span>
        <a
          href={o.lien} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-xs font-semibold"
        >
          Annonce <ExternalLink size={11} />
        </a>
      </div>
    </Card>
  )
}

// ── Fiche détail ─────────────────────────────────────────────

function DetailModal({ opp, onClose, onStatutChange }) {
  const { user } = useAuth()
  const [comments, setComments] = useState(null)
  const [newComment, setNewComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [statut, setStatut] = useState(opp.statut)

  const loadComments = async () => {
    const { data } = await supabase
      .from('commentaires')
      .select('*, profiles:auteur(full_name, email)')
      .eq('opportunite_id', opp.id)
      .order('cree_le')
    setComments(data || [])
  }

  useEffect(() => { loadComments() }, [opp.id])

  const addComment = async () => {
    const contenu = newComment.trim()
    if (!contenu) return
    setSaving(true)
    const { error } = await supabase.from('commentaires').insert({ opportunite_id: opp.id, auteur: user.id, contenu })
    setSaving(false)
    if (!error) { setNewComment(''); loadComments() }
  }

  const changeStatut = async (v) => {
    setStatut(v)
    const { error } = await supabase.from('opportunites').update({ statut: v }).eq('id', opp.id)
    if (error) { setStatut(opp.statut); alert('Impossible de changer le statut : ' + error.message) }
    else onStatutChange(opp.id, v)
  }

  const R = RECHERCHES[opp.recherche]

  return (
    <Modal title={opp.adresse || `${opp.ville} — ${R.label}`} onClose={onClose} width="max-w-2xl">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <ScoreBadge score={opp.score} size="lg" />
        <div className="flex-1 min-w-[140px]">
          <p className="text-gray-400 text-xs">{opp.recherche} · {R.label}</p>
          <p className="text-navy font-bold">{opp.code_postal} {opp.ville}</p>
        </div>
        <a href={opp.lien} target="_blank" rel="noopener noreferrer"
          className="bg-navy text-white hover:bg-navy-light px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
          Voir l'annonce <ExternalLink size={12} />
        </a>
      </div>

      {opp.hors_critere && opp.motif_hors_critere && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          <p className="text-amber-700 font-bold text-xs uppercase tracking-wide mb-1">Piste hors critères</p>
          <p className="text-gray-700">{opp.motif_hors_critere}</p>
        </div>
      )}

      {/* Statut */}
      <div className="mb-5">
        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Statut</label>
        <div className="flex gap-1.5 flex-wrap">
          {STATUTS.map(s => (
            <button key={s.v} onClick={() => changeStatut(s.v)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                statut === s.v ? s.cls + ' ring-2 ring-offset-1 ring-navy/30' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
              }`}>
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {/* Données */}
      <div className="grid sm:grid-cols-2 gap-x-8 mb-5">
        <div>
          <Row label="Type">{opp.type_offre}</Row>
          <Row label="Occupation">{opp.occupation}</Row>
          <Row label="Prix">{opp.prix ? fmt(opp.prix) : null}</Row>
          <Row label="Loyer annuel">{opp.loyer_annuel ? fmt(opp.loyer_annuel) : null}</Row>
          <Row label="Prix / m²">{opp.prix_m2 ? fmtNum(opp.prix_m2) + ' €' : null}</Row>
          <Row label="Rendement brut">{opp.rendement_brut != null ? String(opp.rendement_brut).replace('.', ',') + ' %' : null}</Row>
          <Row label="Ratio clé">{opp.ratio_cle}</Row>
        </div>
        <div>
          <Row label="Surface totale">{opp.surface_totale ? fmtNum(opp.surface_totale) + ' m²' : null}</Row>
          <Row label="Détail surfaces">{opp.surface_detail}</Row>
          <Row label="Surface pondérée">{opp.surface_ponderee ? fmtNum(opp.surface_ponderee) + ' m²' : null}</Row>
          <Row label="Locataire">{opp.locataire}</Row>
          <Row label="Bail">{opp.bail}</Row>
          <Row label="Garanties">{opp.garanties}</Row>
          <Row label="Publiée le">{opp.date_publication_annonce ? fmtDate(opp.date_publication_annonce) : null}</Row>
          <Row label="Source">{opp.source}</Row>
        </div>
      </div>

      {opp.verdict_reglementaire && (
        <div className="mb-5 bg-gray-50 rounded-lg p-3 text-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Verdict réglementaire (pré-screening)</p>
          <div className="flex items-start gap-2"><VerdictBadge verdict={opp.verdict_reglementaire} /><span className="text-gray-700">{opp.verdict_reglementaire}</span></div>
        </div>
      )}

      {Array.isArray(opp.analyse_concurrence?.concurrents) && opp.analyse_concurrence.concurrents.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Concurrence</p>
          <div className="space-y-1">
            {opp.analyse_concurrence.concurrents.map((c, i) => (
              <div key={i} className="flex justify-between text-sm bg-gray-50 rounded px-3 py-1.5">
                <span className="text-gray-700 font-medium">{c.enseigne}{c.type ? <span className="text-gray-400 font-normal"> · {c.type}</span> : null}</span>
                <span className="text-gray-400">{c.distance}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {opp.ca_potentiel && (
        <div className="mb-5 bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">CA potentiel estimé</p>
          <div className="flex gap-4 text-sm flex-wrap">
            {['basse', 'central', 'haute'].map(k => opp.ca_potentiel[k] != null && (
              <div key={k}>
                <p className="text-gray-400 text-[11px] capitalize">{k === 'central' ? 'Central' : `Fourchette ${k}`}</p>
                <p className="font-bold text-navy">{fmtNum(opp.ca_potentiel[k])} €/an</p>
              </div>
            ))}
            {opp.ca_potentiel.recommandation && (
              <div>
                <p className="text-gray-400 text-[11px]">Recommandation</p>
                <p className="font-bold text-emerald-600 capitalize">{opp.ca_potentiel.recommandation}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {(opp.points_forts || opp.points_vigilance) && (
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          {opp.points_forts && (
            <div className="bg-green-50 rounded-lg p-3 text-sm">
              <p className="text-green-700 font-bold text-xs uppercase tracking-wide mb-1">Points forts</p>
              <p className="text-gray-700 whitespace-pre-line">{opp.points_forts}</p>
            </div>
          )}
          {opp.points_vigilance && (
            <div className="bg-orange-50 rounded-lg p-3 text-sm">
              <p className="text-orange-700 font-bold text-xs uppercase tracking-wide mb-1">Points de vigilance</p>
              <p className="text-gray-700 whitespace-pre-line">{opp.points_vigilance}</p>
            </div>
          )}
        </div>
      )}

      {/* Score détaillé */}
      {opp.score_detail && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Détail du score</p>
          <div className="space-y-1">
            {Object.entries(opp.score_detail).map(([crit, pts]) => (
              <div key={crit} className="flex justify-between text-sm px-3 py-1.5 bg-gray-50 rounded">
                <span className="text-gray-600">{crit}</span>
                <span className="font-bold text-navy">{pts}</span>
              </div>
            ))}
          </div>
          {opp.justification_score && <p className="text-gray-500 text-xs mt-2 italic">{opp.justification_score}</p>}
        </div>
      )}

      {/* Commentaires */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <MessageSquare size={13} />Commentaires
        </p>
        {comments === null ? <Spinner /> : comments.length === 0 ? (
          <p className="text-gray-300 text-sm mb-3">Aucun commentaire.</p>
        ) : (
          <div className="space-y-2 mb-3 max-h-56 overflow-y-auto">
            {comments.map(c => (
              <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-semibold text-navy text-xs">
                    {c.auteur ? (c.profiles?.full_name || c.profiles?.email || 'Associé') : '🤖 Pipeline'}
                  </span>
                  <span className="text-gray-300 text-[11px]">{new Date(c.cree_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
                <p className="text-gray-700 whitespace-pre-line">{c.contenu}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() } }}
            placeholder="Ajouter un commentaire..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
          />
          <Btn onClick={addComment} disabled={saving || !newComment.trim()}><Send size={14} /></Btn>
        </div>
      </div>
    </Modal>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function Pipeline() {
  const [opps, setOpps] = useState(null)
  const [lastRun, setLastRun] = useState(null)
  const [tab, setTab] = useState('R1')
  const [detail, setDetail] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  const [fStatut, setFStatut] = useState('travail')
  const [fVille, setFVille] = useState('')
  const [fScoreMin, setFScoreMin] = useState('')
  const [fPrixMax, setFPrixMax] = useState('')
  const [fTri, setFTri] = useState('score')

  const load = async () => {
    const [o, r] = await Promise.all([
      supabase.from('opportunites').select('*'),
      supabase.from('runs').select('*').order('date_run', { ascending: false }).limit(1),
    ])
    setOpps(o.data || [])
    setLastRun(r.data?.[0] || null)
  }

  useEffect(() => { load() }, [])

  const onStatutChange = (id, statut) =>
    setOpps(prev => prev.map(o => o.id === id ? { ...o, statut } : o))

  const villes = useMemo(() =>
    [...new Set((opps || []).map(o => o.ville).filter(Boolean))].sort(), [opps])

  const filterAndSort = (list) => {
    if (fStatut === 'travail') list = list.filter(o => STATUTS_TRAVAIL.includes(o.statut))
    else if (fStatut !== 'tous') list = list.filter(o => o.statut === fStatut)
    if (fVille) list = list.filter(o => o.ville === fVille)
    if (fScoreMin) list = list.filter(o => (o.score || 0) >= Number(fScoreMin))
    if (fPrixMax) list = list.filter(o => (o.prix || o.loyer_annuel || 0) <= Number(fPrixMax))
    const tri = {
      score: (a, b) => (b.score || 0) - (a.score || 0),
      prix: (a, b) => (a.prix || a.loyer_annuel || 0) - (b.prix || b.loyer_annuel || 0),
      date: (a, b) => new Date(b.detecte_le) - new Date(a.detecte_le),
    }
    return [...list].sort(tri[fTri])
  }

  const filtered = useMemo(() =>
    opps ? filterAndSort(opps.filter(o => o.recherche === tab && !o.hors_critere)) : [],
    [opps, tab, fStatut, fVille, fScoreMin, fPrixMax, fTri])

  const horsCriteres = useMemo(() =>
    opps ? filterAndSort(opps.filter(o => o.recherche === tab && o.hors_critere)) : [],
    [opps, tab, fStatut, fVille, fScoreMin, fPrixMax, fTri])

  if (opps === null) return <Spinner />

  const actives = (r) => opps.filter(o => o.recherche === r && !o.hors_critere && STATUTS_TRAVAIL.includes(o.statut)).length
  const nouveaux = opps.filter(o => isNouveau(o) && !o.hors_critere && o.statut === 'active').length

  return (
    <div>
      <PageHeader title="Pipeline" sub="Veille immobilière quotidienne" />

      {/* Bandeau de synthèse */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <div>
            <p className="text-gray-400 text-[11px] uppercase tracking-wide font-bold">Dernier run</p>
            <p className="text-navy font-extrabold text-sm mt-1">
              {lastRun ? new Date(lastRun.date_run).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
            </p>
          </div>
          {Object.entries(RECHERCHES).map(([k, R]) => (
            <div key={k}>
              <p className="text-gray-400 text-[11px] uppercase tracking-wide font-bold">{R.label}</p>
              <p className="text-navy font-extrabold text-xl">{actives(k)}</p>
            </div>
          ))}
          <div>
            <p className="text-gray-400 text-[11px] uppercase tracking-wide font-bold">Nouveautés &lt; 48 h</p>
            <p className={`font-extrabold text-xl ${nouveaux > 0 ? 'text-blue-600' : 'text-navy'}`}>{nouveaux}</p>
          </div>
        </div>
      </Card>

      {/* Onglets R1 / R2 / R3 */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {Object.entries(RECHERCHES).map(([k, { label, I }]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
              tab === k ? 'bg-navy text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
            }`}>
            <I size={14} />{k} · {label}
          </button>
        ))}
        <button onClick={() => setShowFilters(v => !v)}
          className={`ml-auto px-3 py-2 rounded-lg text-sm cursor-pointer inline-flex items-center gap-1.5 ${
            showFilters ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-white text-gray-400 border border-gray-200'
          }`}>
          <SlidersHorizontal size={14} /><span className="hidden sm:inline">Filtres</span>
        </button>
      </div>

      {/* Filtres */}
      {showFilters && (
        <Card className="p-4 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Sel label="Statut" value={fStatut} onChange={e => setFStatut(e.target.value)} className="!mb-0"
              options={[{ v: 'travail', l: 'En cours (défaut)' }, { v: 'tous', l: 'Tous' }, ...STATUTS.map(s => ({ v: s.v, l: s.l }))]} />
            <Sel label="Ville" value={fVille} onChange={e => setFVille(e.target.value)} className="!mb-0"
              options={[{ v: '', l: 'Toutes' }, ...villes.map(v => ({ v, l: v }))]} />
            <Field label="Score min" type="number" min="0" max="100" value={fScoreMin} onChange={e => setFScoreMin(e.target.value)} placeholder="0" className="!mb-0" />
            <Field label="Prix max (€)" type="number" value={fPrixMax} onChange={e => setFPrixMax(e.target.value)} placeholder="∞" className="!mb-0" />
            <Sel label="Tri" value={fTri} onChange={e => setFTri(e.target.value)} className="!mb-0"
              options={[{ v: 'score', l: 'Score ↓' }, { v: 'prix', l: 'Prix ↑' }, { v: 'date', l: 'Plus récent' }]} />
          </div>
        </Card>
      )}

      {/* Sous-titre de section */}
      <p className="text-gray-400 text-xs mb-3">
        {RECHERCHES[tab].sub} — {filtered.length} opportunité{filtered.length > 1 ? 's' : ''}
      </p>

      {/* Cartes */}
      {filtered.length === 0 ? (
        <Empty icon={<Radar size={40} />} text="Aucune opportunité ne correspond aux filtres." />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(o => <OppCard key={o.id} o={o} onOpen={setDetail} />)}
        </div>
      )}

      {/* Pistes hors critères */}
      {horsCriteres.length > 0 && (
        <div className="mt-8">
          <p className="text-amber-700 font-bold text-sm mb-1">Pistes hors critères</p>
          <p className="text-gray-400 text-xs mb-3">
            Dossiers exceptionnels suivis malgré une règle non satisfaite — le motif est indiqué sur chaque carte.
          </p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {horsCriteres.map(o => <OppCard key={o.id} o={o} onOpen={setDetail} />)}
          </div>
        </div>
      )}

      <p className="text-gray-300 text-[11px] text-center mt-10 max-w-xl mx-auto">
        Estimations d'aide à la décision — données d'annonces à vérifier.
        Ne constitue pas un conseil juridique, fiscal ou en investissement.
      </p>

      {detail && <DetailModal opp={detail} onClose={() => setDetail(null)} onStatutChange={onStatutChange} />}
    </div>
  )
}
