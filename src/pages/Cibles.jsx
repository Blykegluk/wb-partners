import { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Crosshair, ExternalLink, MessageSquare, Send, ArrowUpDown, ArrowUp, ArrowDown,
  Building2, LayoutGrid, Map as MapIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/Auth'
import { Card, Modal, Btn, Sel, Field, Empty, Spinner, PageHeader } from '../components/UI'
import { fmtDate } from '../lib/utils'

// ── Config ───────────────────────────────────────────────────
//
// Sourcing propriétaire : des sociétés à démarcher, pas des annonces.
// Première famille : supermarchés/supérettes PME dont le dirigeant EFFECTIF
// (gérant, président ou DG personne physique — holding résolue le cas
// échéant, jamais un commissaire aux comptes) a 60 ans ou plus.

const STATUTS = [
  { v: 'a_qualifier', l: 'À qualifier', cls: 'bg-gray-100 text-gray-600' },
  { v: 'a_contacter', l: 'À contacter', cls: 'bg-blue-100 text-blue-700' },
  { v: 'contactee', l: 'Contactée', cls: 'bg-indigo-100 text-indigo-700' },
  { v: 'en_discussion', l: 'En discussion', cls: 'bg-amber-100 text-amber-700' },
  { v: 'ecartee', l: 'Écartée', cls: 'bg-gray-100 text-gray-400' },
]
const statutCfg = (v) => STATUTS.find(s => s.v === v) || { l: v, cls: 'bg-gray-100 text-gray-500' }

const TYPES = {
  supermarche_dirigeant: 'Supermarché 60+',
  reseau_bio: 'Réseau bio',
}
const REGIONS = {
  11: 'Île-de-France', 93: 'PACA', 84: 'Auvergne-Rhône-Alpes', 76: 'Occitanie',
  75: 'Nouvelle-Aquitaine', 53: 'Bretagne', 52: 'Pays de la Loire', 24: 'Centre-Val de Loire',
  27: 'Bourgogne-Franche-Comté', 44: 'Grand Est', 32: 'Hauts-de-France', 28: 'Normandie', 94: 'Corse',
}
const NAFS = { '47.11D': 'Supermarché', '47.11C': 'Supérette' }

// Tranches d'effectif salarié INSEE
const EFFECTIFS = {
  '00': '0', '01': '1-2', '02': '3-5', '03': '6-9', '11': '10-19',
  '12': '20-49', '21': '50-99', '22': '100-199', 'NN': 'n.c.',
}

// Un même dirigeant à la tête de plusieurs sociétés, c'est le plus souvent un
// groupe en activité — la relève y est en place ailleurs dans le groupe, donc
// invisible dans les organes de direction de chaque société prise isolément.
// Le signalement est indicatif : certains de ces groupes se transmettent quand
// même, l'arbitrage reste aux associés.
const SEUIL_GROUPE = 3

const fmtNum = (n) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)
const fmtKE = (n) => n == null ? null : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n / 1000))} k€`
// dirigeant_naissance est au mois près (AAAA-MM), la précision du registre
const age = (naissance) => naissance ? new Date().getFullYear() - Number(naissance.slice(0, 4)) : null

const scoreColor = (score) =>
  score == null ? '#94a3b8' : score >= 75 ? '#22c55e' : score >= 55 ? '#f59e0b' : '#ef4444'

const nomAuteur = (c) => c.profiles?.full_name || c.profiles?.email?.split('@')[0] || 'Associé'

function ScorePill({ score }) {
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold shrink-0"
      style={{ background: scoreColor(score) }}>{score ?? '—'}</span>
  )
}

// ── Colonnes du tableau ──────────────────────────────────────

const ms = (d) => d ? new Date(d).getTime() : null

const COLONNES = [
  { k: 'score', l: 'Score', num: true, get: c => c.score, cell: c => <ScorePill score={c.score} /> },
  {
    k: 'statut', l: 'Statut', get: c => statutCfg(c.statut).l, td: 'whitespace-nowrap',
    cell: c => <span className={`${statutCfg(c.statut).cls} px-1.5 py-0.5 rounded text-[10px] font-semibold`}>{statutCfg(c.statut).l}</span>,
  },
  {
    k: 'societe', l: 'Société', get: c => c.denomination, td: 'text-sm font-semibold text-navy', style: { minWidth: 190, maxWidth: 280 },
    cell: (c, cm, ctx) => (
      <>
        <span className="line-clamp-2">{c.denomination}</span>
        <span className="block text-[10px] font-normal text-gray-400">
          {c.type === 'reseau_bio' ? 'Réseau bio' : (NAFS[c.naf] || c.naf)}{c.via_holding ? ` · via ${c.via_holding}` : ''}
        </span>
        {ctx?.groupe?.length >= SEUIL_GROUPE && (
          <span className="inline-block mt-1 bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
            Groupe · {ctx.groupe.length} sociétés
          </span>
        )}
      </>
    ),
  },
  { k: 'ville', l: 'Ville', get: c => c.ville || '', td: 'text-sm text-gray-600 whitespace-nowrap', cell: c => `${c.code_postal || ''} ${c.ville || ''}`.trim() },
  {
    k: 'dirigeant', l: 'Dirigeant', get: c => c.dirigeant_nom || '', td: 'text-xs', style: { minWidth: 160, maxWidth: 220 },
    cell: c => (
      <>
        <span className="font-semibold text-gray-700">{c.dirigeant_nom}</span>
        <span className="block text-gray-400">{c.dirigeant_qualite}</span>
      </>
    ),
  },
  {
    k: 'age', l: 'Âge', num: true, get: c => age(c.dirigeant_naissance),
    td: 'text-sm text-right font-bold whitespace-nowrap',
    cell: c => {
      const a = age(c.dirigeant_naissance)
      return a == null ? '—' : <span className={a >= 70 ? 'text-red-600' : a >= 65 ? 'text-orange-500' : 'text-gray-700'}>{a} ans</span>
    },
  },
  {
    k: 'releve', l: 'Relève', get: c => c.releve_possible ? 'possible' : 'aucune', td: 'whitespace-nowrap',
    cell: c => c.releve_possible
      ? <span className="bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded text-[10px] font-semibold">Possible</span>
      : <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">Aucune identifiée</span>,
  },
  {
    k: 'ca', l: 'CA', num: true, get: c => c.ca || null, td: 'text-sm text-right whitespace-nowrap',
    cell: c => c.ca ? (
      <>
        <span className="font-bold text-navy">{fmtKE(c.ca)}</span>
        <span className="block text-[10px] text-gray-400">{c.annee_finances}{c.resultat != null ? ` · rés. ${fmtKE(c.resultat)}` : ''}</span>
      </>
    ) : <span className="text-gray-300">n.p.</span>,
  },
  { k: 'effectif', l: 'Effectif', get: c => c.effectif || '', td: 'text-sm text-right text-gray-600 whitespace-nowrap', cell: c => EFFECTIFS[c.effectif] || '—' },
  { k: 'etab', l: 'Étab.', num: true, get: c => c.nb_etablissements, td: 'text-sm text-right text-gray-600 whitespace-nowrap', cell: c => c.nb_etablissements ?? '—' },
  { k: 'creation', l: 'Créée', num: true, get: c => ms(c.date_creation), td: 'text-xs text-gray-400 whitespace-nowrap', cell: c => c.date_creation ? c.date_creation.slice(0, 4) : '—' },
  {
    k: 'commentaire', l: 'Dernier commentaire', get: (c, cm) => cm[0]?.contenu || '', td: 'text-xs', style: { minWidth: 170, maxWidth: 250 },
    cell: (c, cm) => cm[0] ? (
      <span className="block bg-blue-50/80 border-l-2 border-blue-400 rounded-r px-2 py-1">
        <span className="font-semibold text-blue-800">{nomAuteur(cm[0])}</span>
        <span className="block text-gray-700 line-clamp-2" title={cm[0].contenu}>{cm[0].contenu}</span>
      </span>
    ) : <span className="text-gray-300">—</span>,
  },
]

// ── Vue carte ────────────────────────────────────────────────

function CartesCibles({ cibles, onOpen }) {
  const geo = cibles.filter(c => c.latitude && c.longitude)
  const sansGeo = cibles.length - geo.length
  const center = geo.length
    ? [geo.reduce((s, c) => s + Number(c.latitude), 0) / geo.length,
       geo.reduce((s, c) => s + Number(c.longitude), 0) / geo.length]
    : [46.6, 2.4]

  return (
    <>
      {geo.length === 0 ? (
        <Empty icon={<MapIcon size={40} />} text="Aucune cible géolocalisée pour cette sélection." />
      ) : (
        <Card className="overflow-hidden" style={{ height: 'clamp(420px, calc(100vh - 320px), 760px)', isolation: 'isolate' }}>
          <MapContainer center={center} zoom={geo.length > 60 ? 9 : 6} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {geo.map(c => {
              const col = scoreColor(c.score)
              const a = age(c.dirigeant_naissance)
              return (
                <CircleMarker
                  key={c.id}
                  center={[Number(c.latitude), Number(c.longitude)]}
                  radius={c.type === 'reseau_bio' ? 12 : 9}
                  pathOptions={{
                    color: col, fillColor: col,
                    fillOpacity: c.geo_approx ? 0.35 : 0.75,
                    weight: 2, dashArray: c.geo_approx ? '3 3' : null,
                  }}
                >
                  <Popup>
                    <div className="text-xs leading-relaxed min-w-[190px]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white font-bold shrink-0" style={{ background: col }}>
                          {c.score ?? '—'}
                        </span>
                        <span className="font-bold">{TYPES[c.type] || c.type}</span>
                      </div>
                      <p className="font-semibold">{c.denomination}</p>
                      <p className="text-gray-500">{c.code_postal} {c.ville}</p>
                      <p className="mt-1">
                        {c.dirigeant_nom ? <>{c.dirigeant_nom}{a != null ? <strong> · {a} ans</strong> : null}</> : 'Dirigeant à identifier'}
                      </p>
                      {c.ca ? <p className="m-0">CA {fmtKE(c.ca)} ({c.annee_finances})</p> : null}
                      <button
                        onClick={() => onOpen(c)}
                        className="mt-2 bg-navy text-white px-2.5 py-1 rounded font-semibold cursor-pointer"
                      >
                        Voir la fiche
                      </button>
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>
        </Card>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500" /> Score ≥ 75</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500" /> 55–74</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500" /> &lt; 55</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-full border-2 border-gray-400" /> Gros point = réseau bio</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-dashed border-gray-400" /> Position approximative (commune)</span>
      </div>

      {sansGeo > 0 && (
        <p className="text-gray-400 text-[11px] mt-2">
          {sansGeo} cible{sansGeo > 1 ? 's' : ''} sans coordonnées — visible{sansGeo > 1 ? 's' : ''} en vue liste uniquement.
        </p>
      )}
    </>
  )
}

// ── Fiche détail ─────────────────────────────────────────────

function Row({ label, children }) {
  if (children == null || children === '' || children === '—') return null
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-gray-50 text-sm">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-800 text-right font-medium">{children}</span>
    </div>
  )
}

function CibleModal({ cible, groupe, onClose, onStatutChange, onCommentAdded }) {
  const { user } = useAuth()
  const [comments, setComments] = useState(null)
  const [newComment, setNewComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [statut, setStatut] = useState(cible.statut)

  useEffect(() => {
    supabase.from('cibles_commentaires')
      .select('*, profiles:auteur(full_name, email)')
      .eq('cible_id', cible.id).order('cree_le')
      .then(({ data }) => setComments(data || []))
  }, [cible.id])

  const addComment = async () => {
    const contenu = newComment.trim()
    if (!contenu) return
    setSaving(true)
    const { data, error } = await supabase.from('cibles_commentaires')
      .insert({ cible_id: cible.id, auteur: user.id, contenu })
      .select('id, cible_id, contenu, cree_le, auteur, profiles:auteur(full_name, email)')
      .single()
    setSaving(false)
    if (!error) {
      setNewComment('')
      setComments(prev => [...(prev || []), data])
      onCommentAdded?.(data)
    }
  }

  const changeStatut = async (v) => {
    setStatut(v)
    const { error } = await supabase.from('cibles').update({ statut: v }).eq('id', cible.id)
    if (error) { setStatut(cible.statut); alert('Impossible de changer le statut : ' + error.message) }
    else onStatutChange(cible.id, v)
  }

  const a = age(cible.dirigeant_naissance)

  return (
    <Modal title={cible.denomination} onClose={onClose} width="max-w-2xl">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="w-14 h-14 rounded-full text-white text-xl font-extrabold inline-flex items-center justify-center shrink-0"
          style={{ background: scoreColor(cible.score) }}>{cible.score ?? '—'}</span>
        <div className="flex-1 min-w-[140px]">
          <p className="text-gray-400 text-xs">{TYPES[cible.type] || cible.type} · {NAFS[cible.naf] || cible.naf} · {REGIONS[cible.region] || cible.region} · SIREN {cible.siren}</p>
          <p className="text-navy font-bold">{cible.code_postal} {cible.ville}</p>
          {cible.adresse && <p className="text-gray-400 text-xs">{cible.adresse}</p>}
        </div>
        <a href={cible.lien} target="_blank" rel="noopener noreferrer"
          className="bg-navy text-white hover:bg-navy-light px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
          Fiche entreprise <ExternalLink size={12} />
        </a>
      </div>

      {/* Statut de démarchage */}
      <div className="mb-5">
        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Suivi du contact</label>
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

      {cible.notes && (
        <div className="mb-5 bg-emerald-50/60 border border-emerald-100 rounded-lg p-3 text-sm">
          <p className="text-emerald-700 font-bold text-xs uppercase tracking-wide mb-1">Note d'étude</p>
          <p className="m-0 text-gray-700 whitespace-pre-line">{cible.notes}</p>
        </div>
      )}

      {/* Dirigeant effectif */}
      <div className="mb-5 bg-blue-50/50 border border-blue-100 rounded-lg p-3">
        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">Dirigeant effectif</p>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <p className="m-0 font-bold text-navy">{cible.dirigeant_nom}</p>
          {a != null && <p className={`m-0 font-extrabold ${a >= 70 ? 'text-red-600' : 'text-orange-500'}`}>{a} ans</p>}
        </div>
        <p className="m-0 text-xs text-gray-500">
          {cible.dirigeant_qualite}{cible.dirigeant_naissance ? ` · né(e) en ${cible.dirigeant_naissance.split('-').reverse().join('/')}` : ''}
          {cible.via_holding ? ` · via la holding ${cible.via_holding}` : ''}
        </p>
        <p className={`m-0 mt-1.5 text-xs font-semibold ${cible.releve_possible ? 'text-orange-600' : 'text-green-700'}`}>
          {cible.releve_possible
            ? 'Relève possible : un co-dirigeant de moins de 45 ans est en place.'
            : 'Aucune relève identifiée dans la direction.'}
        </p>
        {Array.isArray(cible.co_dirigeants) && cible.co_dirigeants.length > 1 && (
          <div className="mt-2 space-y-1">
            {cible.co_dirigeants.map((d, i) => (
              <div key={i} className="flex justify-between text-xs bg-white/70 rounded px-2 py-1">
                <span className="text-gray-700">{d.n}<span className="text-gray-400"> · {d.q}</span></span>
                <span className="text-gray-400">{d.d ? `${age(d.d)} ans` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {groupe && groupe.length > 1 && (
        <div className="mb-5 bg-purple-50/60 border border-purple-100 rounded-lg p-3">
          <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-1">
            {groupe.length} sociétés dirigées par {cible.dirigeant_nom}
          </p>
          <p className="m-0 mb-2 text-xs text-gray-500">
            Un seul interlocuteur pour l'ensemble — mais souvent le signe d'un groupe en activité,
            dont la relève est en place ailleurs que dans les organes de direction de cette société.
          </p>
          <div className="space-y-1">
            {groupe.map(g => (
              <div key={g.id} className={`flex justify-between gap-3 text-xs rounded px-2 py-1 ${g.id === cible.id ? 'bg-white font-semibold' : 'bg-white/60'}`}>
                <span className="text-gray-700">{g.denomination}<span className="text-gray-400"> · {g.code_postal} {g.ville}</span></span>
                <span className="text-gray-500 shrink-0">{g.ca ? fmtKE(g.ca) : '—'}{g.statut === 'ecartee' ? ' · écartée' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Données société */}
      <div className="grid sm:grid-cols-2 gap-x-8 mb-5">
        <div>
          <Row label={`CA${cible.annee_finances ? ` ${cible.annee_finances}` : ''}`}>{cible.ca ? fmtNum(cible.ca) + ' €' : null}</Row>
          <Row label="Résultat net">{cible.resultat != null && cible.ca ? fmtNum(cible.resultat) + ' €' : null}</Row>
          <Row label="Effectif salarié">{EFFECTIFS[cible.effectif]}</Row>
        </div>
        <div>
          <Row label="Établissements ouverts">{cible.nb_etablissements}</Row>
          <Row label="Création">{cible.date_creation ? fmtDate(cible.date_creation) : null}</Row>
          <Row label="Détectée le">{fmtDate(cible.detecte_le)}</Row>
        </div>
      </div>
      {!cible.ca && (
        <p className="text-gray-400 text-xs -mt-3 mb-5">
          Comptes non publiés ou déposés avec confidentialité — CA à obtenir en direct.
        </p>
      )}

      {/* Détail du score */}
      {cible.score_detail && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Score de transmissibilité</p>
          <div className="space-y-1">
            {Object.entries(cible.score_detail).map(([crit, pts]) => (
              <div key={crit} className="flex justify-between text-sm px-3 py-1.5 bg-gray-50 rounded">
                <span className="text-gray-600">{crit}</span>
                <span className="font-bold text-navy">{pts}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commentaires */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <MessageSquare size={13} />Suivi & commentaires
        </p>
        {comments === null ? <Spinner /> : comments.length === 0 ? (
          <p className="text-gray-300 text-sm mb-3">Aucun commentaire — notez ici les appels, contacts et impressions.</p>
        ) : (
          <div className="space-y-2 mb-3 max-h-56 overflow-y-auto">
            {comments.map(c => (
              <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-semibold text-navy text-xs">{nomAuteur(c)}</span>
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
            placeholder="Ajouter une note de suivi..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
          />
          <Btn onClick={addComment} disabled={saving || !newComment.trim()}><Send size={14} /></Btn>
        </div>
      </div>
    </Modal>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function Cibles() {
  const [cibles, setCibles] = useState(null)
  const [commentaires, setCommentaires] = useState([])
  const [detail, setDetail] = useState(null)
  const [vue, setVue] = useState('liste')
  const [tri, setTri] = useState({ k: 'score', desc: true })

  const [fType, setFType] = useState('')
  const [fRegion, setFRegion] = useState('')
  const [fNaf, setFNaf] = useState('')
  const [fStatut, setFStatut] = useState('actives')
  const [fVille, setFVille] = useState('')
  const [fCaMin, setFCaMin] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('cibles').select('*'),
      supabase.from('cibles_commentaires')
        .select('cible_id, contenu, cree_le, auteur, profiles:auteur(full_name, email)')
        .order('cree_le', { ascending: false }),
    ]).then(([c, m]) => {
      setCibles(c.data || [])
      setCommentaires(m.data || [])
    })
  }, [])

  const commentairesParCible = useMemo(() => {
    const m = new Map()
    for (const c of commentaires) {
      if (!m.has(c.cible_id)) m.set(c.cible_id, [])
      m.get(c.cible_id).push(c)
    }
    return m
  }, [commentaires])

  const onStatutChange = (id, statut) =>
    setCibles(prev => prev.map(c => c.id === id ? { ...c, statut } : c))

  // Sociétés partageant le même dirigeant effectif — écartées comprises : un
  // groupe reste un groupe même si une partie a déjà été écartée.
  const groupes = useMemo(() => {
    const m = new Map()
    for (const c of cibles || []) {
      if (!c.dirigeant_nom) continue
      if (!m.has(c.dirigeant_nom)) m.set(c.dirigeant_nom, [])
      m.get(c.dirigeant_nom).push(c)
    }
    return m
  }, [cibles])

  const filtrees = useMemo(() => {
    if (!cibles) return []
    let list = cibles
    if (fStatut === 'actives') list = list.filter(c => c.statut !== 'ecartee')
    else if (fStatut !== 'toutes') list = list.filter(c => c.statut === fStatut)
    if (fType) list = list.filter(c => c.type === fType)
    if (fRegion) list = list.filter(c => c.region === fRegion)
    if (fNaf) list = list.filter(c => c.naf === fNaf)
    if (fVille) list = list.filter(c => (c.ville || '').toLowerCase().includes(fVille.toLowerCase()) || (c.code_postal || '').startsWith(fVille))
    if (fCaMin) list = list.filter(c => (c.ca || 0) >= Number(fCaMin) * 1000)
    const col = COLONNES.find(c => c.k === tri.k) || COLONNES[0]
    const val = (c) => col.get(c, commentairesParCible.get(c.id) || [])
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b)
      if (va == null || va === '') return 1
      if (vb == null || vb === '') return -1
      const cmp = col.num ? va - vb : String(va).localeCompare(String(vb), 'fr')
      return tri.desc ? -cmp : cmp
    })
  }, [cibles, fType, fRegion, fNaf, fStatut, fVille, fCaMin, tri, commentairesParCible])

  if (cibles === null) return <Spinner />

  const nb = (f) => cibles.filter(f).length
  const cliquer = (k) => setTri(t => t.k === k ? { k, desc: !t.desc } : { k, desc: true })

  return (
    <div>
      <PageHeader title="Cibles de reprise" sub="Sourcing propriétaire, à démarcher : supermarchés indépendants à dirigeant de 60 ans et plus, et réseaux de magasins bio" />

      <Card className="p-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
          <div>
            <p className="text-gray-400 text-[11px] uppercase tracking-wide font-bold">Cibles</p>
            <p className="text-navy font-extrabold text-xl">{nb(() => true)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-[11px] uppercase tracking-wide font-bold">Île-de-France</p>
            <p className="text-navy font-extrabold text-xl">{nb(c => c.region === '11')}</p>
          </div>
          <div>
            <p className="text-gray-400 text-[11px] uppercase tracking-wide font-bold">PACA</p>
            <p className="text-navy font-extrabold text-xl">{nb(c => c.region === '93')}</p>
          </div>
          <div>
            <p className="text-gray-400 text-[11px] uppercase tracking-wide font-bold">Dirigeant 70+</p>
            <p className="text-navy font-extrabold text-xl">{nb(c => age(c.dirigeant_naissance) >= 70)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-[11px] uppercase tracking-wide font-bold">CA &gt; 2 M€ connu</p>
            <p className="text-navy font-extrabold text-xl">{nb(c => (c.ca || 0) > 2000000)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-[11px] uppercase tracking-wide font-bold">En cours de contact</p>
            <p className={`font-extrabold text-xl ${nb(c => ['a_contacter', 'contactee', 'en_discussion'].includes(c.statut)) > 0 ? 'text-blue-600' : 'text-navy'}`}>
              {nb(c => ['a_contacter', 'contactee', 'en_discussion'].includes(c.statut))}
            </p>
          </div>
        </div>
      </Card>

      {/* Bascule Liste / Carte */}
      <div className="inline-flex bg-white border border-gray-200 rounded-lg p-0.5 mb-4">
        <button onClick={() => setVue('liste')}
          className={`px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors ${
            vue === 'liste' ? 'bg-navy text-white' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <LayoutGrid size={14} /><span className="hidden sm:inline">Liste</span>
        </button>
        <button onClick={() => setVue('carte')}
          className={`px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors ${
            vue === 'carte' ? 'bg-navy text-white' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <MapIcon size={14} /><span className="hidden sm:inline">Carte</span>
        </button>
      </div>

      {/* Filtres */}
      <Card className="p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Sel label="Famille" value={fType} onChange={e => setFType(e.target.value)} className="!mb-0"
            options={[{ v: '', l: 'Toutes' }, ...Object.entries(TYPES).map(([v, l]) => ({ v, l }))]} />
          <Sel label="Région" value={fRegion} onChange={e => setFRegion(e.target.value)} className="!mb-0"
            options={[{ v: '', l: 'Toutes' }, ...[...new Set((cibles || []).map(c => c.region).filter(Boolean))].sort()
              .map(r => ({ v: r, l: REGIONS[r] || r }))]} />
          <Sel label="Format" value={fNaf} onChange={e => setFNaf(e.target.value)} className="!mb-0"
            options={[{ v: '', l: 'Tous' }, { v: '47.11D', l: 'Supermarchés' }, { v: '47.11C', l: 'Supérettes' }]} />
          <Sel label="Statut" value={fStatut} onChange={e => setFStatut(e.target.value)} className="!mb-0"
            options={[{ v: 'actives', l: 'Actives (défaut)' }, { v: 'toutes', l: 'Toutes' }, ...STATUTS.map(s => ({ v: s.v, l: s.l }))]} />
          <Field label="Ville ou CP" value={fVille} onChange={e => setFVille(e.target.value)} placeholder="ex. 92 ou Nice" className="!mb-0" />
          <Field label="CA min (k€)" type="number" value={fCaMin} onChange={e => setFCaMin(e.target.value)} placeholder="0" className="!mb-0" />
        </div>
      </Card>

      <p className="text-gray-400 text-xs mb-3">
        {filtrees.length} cible{filtrees.length > 1 ? 's' : ''} · {vue === 'carte'
          ? 'les filtres s\'appliquent à la carte — cliquez sur un point pour ouvrir la fiche'
          : 'cliquez sur un en-tête pour trier, sur une ligne pour ouvrir la fiche et suivre le contact'}
      </p>

      {vue === 'carte' ? (
        <CartesCibles cibles={filtrees} onOpen={setDetail} />
      ) : filtrees.length === 0 ? (
        <Empty icon={<Crosshair size={40} />} text="Aucune cible ne correspond aux filtres." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 1350 }}>
            <thead>
              <tr className="bg-gray-50 text-left">
                {COLONNES.map(c => (
                  <th key={c.k} onClick={() => cliquer(c.k)}
                    className={`px-3 py-3 text-[11px] font-bold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-navy ${tri.k === c.k ? 'text-navy' : 'text-gray-400'}`}>
                    <span className="inline-flex items-center gap-1">
                      {c.l}
                      {tri.k === c.k
                        ? (tri.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)
                        : <ArrowUpDown size={11} className="opacity-30" />}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrees.map(c => {
                const cm = commentairesParCible.get(c.id) || []
                return (
                  <tr key={c.id} onClick={() => setDetail(c)}
                    className="border-t border-gray-50 hover:bg-blue-50/40 cursor-pointer align-top">
                    {COLONNES.map(col => (
                      <td key={col.k} style={col.style} className={`px-3 py-2.5 ${col.td || ''}`}>
                        {col.cell ? col.cell(c, cm, { groupe: groupes.get(c.dirigeant_nom) }) : (col.get(c, cm) || '—')}
                      </td>
                    ))}
                    <td className="px-3 py-2.5">
                      {c.lien && (
                        <a href={c.lien} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          className="text-blue-500 hover:text-blue-700" title="Fiche annuaire-entreprises">
                          <Building2 size={14} />
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-gray-300 text-[11px] text-center mt-10 max-w-2xl mx-auto">
        Données issues des registres publics (annuaire-entreprises.data.gouv.fr), collectées le 21/08/2026.
        Le score mesure une probabilité de transmissibilité, pas une valeur — chaque dossier se qualifie par un contact direct.
        Ne constitue pas un conseil juridique, fiscal ou en investissement.
      </p>

      {detail && <CibleModal cible={detail} groupe={groupes.get(detail.dirigeant_nom)} onClose={() => setDetail(null)} onStatutChange={onStatutChange}
        onCommentAdded={c => setCommentaires(prev => [c, ...prev])} />}
    </div>
  )
}
