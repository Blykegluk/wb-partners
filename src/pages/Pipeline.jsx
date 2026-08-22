import { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Radar, ExternalLink, MessageSquare, Send, MapPin, Sparkles,
  SlidersHorizontal, Store, Hotel, KeyRound, FileText, ChevronLeft,
  LayoutGrid, Map as MapIcon, Building2, Table2, ArrowUpDown, ArrowUp, ArrowDown,
  Gavel,
} from 'lucide-react'
import { marked } from 'marked'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/Auth'
import { Card, Modal, Btn, Sel, Field, Empty, Spinner, PageHeader } from '../components/UI'
import { fmt, fmtDate } from '../lib/utils'

// ── Config ───────────────────────────────────────────────────

const RECHERCHES = {
  R1: { label: 'Murs commerciaux', sub: 'Rendement patrimonial', I: KeyRound },
  R2: { label: 'Conversion hôtelière', sub: 'Immeubles à rénover', I: Hotel },
  R3: { label: 'Supermarché', sub: 'Bio ou conventionnel', I: Store },
  R4: { label: 'Neuf banlieue', sub: 'Locaux neufs ≥ 10 %', I: Building2 },
  R5: { label: 'BODACC alimentaire', sub: 'Procédures collectives — commerces alimentaires', I: Gavel },
}

// Seuil de rendement brut « satisfaisant » par recherche, pour la couleur.
const SEUIL_RENDEMENT = { R1: 8, R4: 10 }

// Tri par défaut de chaque recherche. Sur R5 les scores sont provisoires
// (tous à 50) : c'est la fraîcheur de la détection qui trie utilement.
const TRI_DEFAUT_LISTE = { R5: 'date' }
const TRI_DEFAUT_DETAILS = { R5: { k: 'detecte', desc: true } }

// Candidat pour le laboratoire — arbitrage manuel des associés (R3, R5).
const CANDIDAT_LAB = [
  { v: 'oui', l: 'Oui', cls: 'bg-green-100 text-green-700' },
  { v: 'a_etudier', l: 'À étudier', cls: 'bg-amber-100 text-amber-700' },
  { v: 'non', l: 'Non', cls: 'bg-gray-100 text-gray-500' },
]
const CANDIDAT_LAB_RECHERCHES = ['R3', 'R5']
const candidatCfg = (v) => CANDIDAT_LAB.find(c => c.v === v) || null

// ── BODACC (R5) ──────────────────────────────────────────────
// Les annonces BODACC n'ont ni prix ni surface : l'identité du dossier,
// c'est la société, la nature du jugement et le tribunal.
// Une ligne BODACC n'est pas une annonce à vendre : c'est un dossier judiciaire.
const nomLigne = (recherche) => recherche === 'R5' ? 'dossier' : 'opportunité'

const bodacc = (o) => o.bodacc_detail || {}
const societe = (o) => o.locataire || bodacc(o).denomination || null
// `type_offre` est préfixé « BODACC — » ; la nature seule suffit à l'affichage.
const natureJugement = (o) => bodacc(o).nature || (o.type_offre || '').replace(/^BODACC\s*[—–-]\s*/, '') || null

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

// Dernier commentaire d'un associé (les commentaires système — changements
// de prix consignés par la veille — ont un auteur NULL et restent discrets).
const nomAuteur = (c) => c.profiles?.full_name || c.profiles?.email?.split('@')[0] || 'Associé'
const dernierCommentaire = (liste = []) => liste.find(c => c.auteur) || null

// Encart commentaire : la parole des associés doit se voir au premier
// coup d'œil, dans la liste comme sur la carte.
function EncartCommentaire({ commentaires, compact = false }) {
  const dernier = dernierCommentaire(commentaires)
  if (!dernier) return null
  const nb = commentaires.filter(c => c.auteur).length
  return (
    <div className={`bg-blue-50/80 border-l-2 border-blue-400 rounded-r px-2.5 py-1.5 ${compact ? 'mt-1.5' : 'mt-2.5'}`}>
      <p className="m-0 text-[11px] font-semibold text-blue-800 flex items-center gap-1">
        <MessageSquare size={10} className="shrink-0" />
        {nomAuteur(dernier)} · {fmtDate(dernier.cree_le)}
        {nb > 1 && <span className="font-normal text-blue-500">· {nb} commentaires</span>}
      </p>
      <p className={`m-0 mt-0.5 text-xs text-gray-700 ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>{dernier.contenu}</p>
    </div>
  )
}

const scoreColor = (score) =>
  score == null ? '#94a3b8' : score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'

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

function CandidatBadge({ valeur }) {
  const c = candidatCfg(valeur)
  if (!c) return null
  return <span className={`${c.cls} px-2 py-0.5 rounded-full text-[10px] font-bold`}>Labo : {c.l}</span>
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

function OppCard({ o, onOpen, commentaires = [] }) {
  const s = statutCfg(o.statut)
  const estBodacc = o.recherche === 'R5'
  const B = bodacc(o)
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
            {estBodacc && <CandidatBadge valeur={o.candidat_lab} />}
          </div>
          <p className="font-bold text-navy text-sm truncate">
            {estBodacc ? (societe(o) || 'Société non communiquée') : (o.adresse || 'Adresse à confirmer')}
          </p>
          <p className="text-gray-400 text-xs flex items-center gap-1">
            <MapPin size={11} className="shrink-0" />{o.code_postal} {o.ville}
            {!estBodacc && o.type_offre === 'location' && <span className="ml-1 text-indigo-500 font-semibold">· Location</span>}
          </p>
          {estBodacc && o.adresse && <p className="text-gray-400 text-xs truncate">{o.adresse}</p>}
        </div>
      </div>

      {estBodacc ? (
        <div className="mt-3 space-y-1.5">
          {natureJugement(o) && (
            <p className="m-0 text-[11px] font-semibold text-purple-700 bg-purple-50 rounded px-2 py-1">{natureJugement(o)}</p>
          )}
          <p className="m-0 text-xs text-gray-500">
            {B.date_jugement ? `Jugé le ${fmtDate(B.date_jugement)}` : 'Date de jugement à vérifier'}
            {B.siren ? ` · SIREN ${B.siren}` : ''}
          </p>
          {B.tribunal && <p className="m-0 text-xs text-gray-400 truncate" title={B.tribunal}>{B.tribunal}</p>}
        </div>
      ) : (
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
      )}

      {/* Infos clés par recherche */}
      <div className="mt-2 text-xs text-gray-500 space-y-0.5">
        {estBodacc && (
          <>
            {o.ca_potentiel?.central && <p>CA potentiel : <span className="font-semibold text-gray-700">{fmtNum(o.ca_potentiel.central)} €/an</span>{o.ca_potentiel.recommandation ? ` · reco ${o.ca_potentiel.recommandation}` : ''}</p>}
            {o.occupation && <p className="line-clamp-2" title={o.occupation}>Activité : {o.occupation}</p>}
            {o.points_vigilance && (
              <p className="text-amber-700 line-clamp-2" title={o.points_vigilance}>{o.points_vigilance}</p>
            )}
          </>
        )}
        {(o.recherche === 'R1' || o.recherche === 'R4') && (
          <>
            {o.rendement_brut != null && (
              <p><span className={`font-bold ${o.rendement_brut >= SEUIL_RENDEMENT[o.recherche] ? 'text-green-600' : 'text-orange-500'}`}>{String(o.rendement_brut).replace('.', ',')} % brut</span>{o.occupation ? ` · ${o.occupation}` : ''}</p>
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

      <EncartCommentaire commentaires={commentaires} />

      {o.hors_critere && o.motif_hors_critere && (
        <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
          {o.motif_hors_critere}
        </p>
      )}

      <div className="mt-3 pt-2 border-t border-gray-50 flex items-center justify-between">
        <span className="text-gray-300 text-[11px]">
          {o.source}
          {estBodacc && o.date_publication_annonce ? ` · publié le ${fmtDate(o.date_publication_annonce)}` : ''}
          {' · détecté le '}{fmtDate(o.detecte_le)}
        </span>
        <a
          href={o.lien} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-xs font-semibold"
        >
          {estBodacc ? 'Annonce BODACC' : 'Annonce'} <ExternalLink size={11} />
        </a>
      </div>
    </Card>
  )
}


// ── Vue Détails : tableau triable ────────────────────────────
//
// Toutes les informations lisibles d'un coup, tri par clic sur les
// en-têtes comme dans un tableur. Le clic sur une ligne ouvre la fiche.

// Une colonne : `get` sert au tri (et au rendu par défaut), `cell` au rendu
// quand il demande du balisage. `td` complète les classes de la cellule.
const ms = (d) => d ? new Date(d).getTime() : null

const C = {
  score: {
    k: 'score', l: 'Score', num: true, get: o => o.score,
    cell: o => (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold"
        style={{ background: scoreColor(o.score) }}>{o.score ?? '—'}</span>
    ),
  },
  statut: {
    k: 'statut', l: 'Statut', get: o => statutCfg(o.statut).l, td: 'whitespace-nowrap',
    cell: o => (
      <>
        <span className={`${statutCfg(o.statut).cls} px-1.5 py-0.5 rounded text-[10px] font-semibold`}>{statutCfg(o.statut).l}</span>
        {o.hors_critere && <span className="block mt-1 text-[9px] font-bold text-amber-600">HORS CRITÈRES</span>}
      </>
    ),
  },
  adresse: {
    k: 'adresse', l: 'Adresse', get: o => o.adresse || '',
    td: 'text-sm font-semibold text-navy', style: { minWidth: 170 },
    cell: o => (
      <>
        {o.adresse || 'Adresse à confirmer'}
        <span className="block text-[10px] font-normal text-gray-400">{o.recherche} · {RECHERCHES[o.recherche]?.label}</span>
      </>
    ),
  },
  ville: {
    k: 'ville', l: 'Ville', get: o => o.ville || '',
    td: 'text-sm text-gray-600 whitespace-nowrap', cell: o => `${o.code_postal || ''} ${o.ville || ''}`.trim() || '—',
  },
  montant: {
    k: 'montant', l: 'Prix / Loyer', num: true, get: o => o.prix ?? o.loyer_annuel,
    td: 'text-sm font-bold text-navy text-right whitespace-nowrap',
    cell: o => o.type_offre === 'location'
      ? (o.loyer_annuel ? `${fmtNum(o.loyer_annuel)} €/an` : '—')
      : (o.prix ? `${fmtNum(o.prix)} €` : '—'),
  },
  prix_m2: {
    k: 'prix_m2', l: '€/m²', num: true, get: o => o.prix_m2,
    td: 'text-sm text-right text-gray-600 whitespace-nowrap', cell: o => o.prix_m2 ? fmtNum(o.prix_m2) : '—',
  },
  surface: {
    k: 'surface', l: 'Surface', num: true, get: o => o.surface_totale,
    td: 'text-sm text-right text-gray-600 whitespace-nowrap', cell: o => o.surface_totale ? `${fmtNum(o.surface_totale)} m²` : '—',
  },
  rendement: {
    k: 'rendement', l: 'Rdt brut', num: true, get: o => o.rendement_brut,
    td: 'text-sm text-right font-semibold whitespace-nowrap',
    cell: o => {
      if (o.rendement_brut == null) return '—'
      const seuil = SEUIL_RENDEMENT[o.recherche]
      return <span className={seuil && o.rendement_brut >= seuil ? 'text-green-600' : 'text-orange-500'}>{String(o.rendement_brut).replace('.', ',')} %</span>
    },
  },
  // R3 : les deux scénarios d'exploitation estimés par la veille — CA si
  // enseigne bio (Naturalia), CA si conventionnel (G20). Le format
  // recommandé est affiché en gras.
  ca_naturalia: {
    k: 'ca_naturalia', l: 'CA Naturalia', num: true,
    get: o => o.ca_potentiel?.ca_naturalia != null ? Number(o.ca_potentiel.ca_naturalia) : null,
    td: 'text-sm text-right whitespace-nowrap',
    cellClass: o => String(o.ca_potentiel?.recommandation || '').startsWith('bio') ? 'font-bold text-emerald-700' : 'text-gray-600',
    cell: o => o.ca_potentiel?.ca_naturalia != null ? `${fmtNum(o.ca_potentiel.ca_naturalia)} €/an` : '—',
  },
  ca_g20: {
    k: 'ca_g20', l: 'CA G20', num: true,
    get: o => o.ca_potentiel?.ca_g20 != null ? Number(o.ca_potentiel.ca_g20) : null,
    td: 'text-sm text-right whitespace-nowrap',
    cellClass: o => String(o.ca_potentiel?.recommandation || '').startsWith('conventionnel') ? 'font-bold text-emerald-700' : 'text-gray-600',
    cell: o => o.ca_potentiel?.ca_g20 != null ? `${fmtNum(o.ca_potentiel.ca_g20)} €/an` : '—',
  },
  forts: {
    k: 'forts', l: 'Points forts', get: o => o.points_forts || '',
    td: 'text-xs text-green-700', style: { minWidth: 200, maxWidth: 280 },
    cell: o => <span className="line-clamp-3" title={o.points_forts || ''}>{o.points_forts || '—'}</span>,
  },
  vigilance: {
    k: 'vigilance', l: 'Points de vigilance', get: o => o.points_vigilance || '',
    td: 'text-xs text-amber-700', style: { minWidth: 200, maxWidth: 280 },
    cell: o => <span className="line-clamp-3" title={o.points_vigilance || ''}>{o.points_vigilance || '—'}</span>,
  },
  commentaire: {
    k: 'commentaire', l: 'Dernier commentaire', get: (o, cm) => dernierCommentaire(cm)?.contenu || '',
    td: 'text-xs', style: { minWidth: 180, maxWidth: 260 },
    cell: (o, cm) => {
      const dernier = dernierCommentaire(cm)
      if (!dernier) return <span className="text-gray-300">—</span>
      return (
        <span className="block bg-blue-50/80 border-l-2 border-blue-400 rounded-r px-2 py-1">
          <span className="font-semibold text-blue-800">{nomAuteur(dernier)}</span>
          <span className="block text-gray-700 line-clamp-2" title={dernier.contenu}>{dernier.contenu}</span>
        </span>
      )
    },
  },
  detecte: {
    k: 'detecte', l: 'Détecté le', num: true, get: o => ms(o.detecte_le),
    td: 'text-xs text-gray-400 whitespace-nowrap', cell: o => fmtDate(o.detecte_le),
  },

  // ── Colonnes BODACC (R5) ───────────────────────────────────
  candidat: {
    k: 'candidat', l: 'Labo', get: o => candidatCfg(o.candidat_lab)?.l || '', td: 'whitespace-nowrap',
    cell: o => candidatCfg(o.candidat_lab)
      ? <span className={`${candidatCfg(o.candidat_lab).cls} px-1.5 py-0.5 rounded text-[10px] font-bold`}>{candidatCfg(o.candidat_lab).l}</span>
      : <span className="text-gray-300">—</span>,
  },
  societe: {
    k: 'societe', l: 'Société', get: o => societe(o) || '',
    td: 'text-sm font-semibold text-navy', style: { minWidth: 160 },
    cell: o => (
      <>
        {societe(o) || 'Non communiquée'}
        {o.adresse && <span className="block text-[10px] font-normal text-gray-400">{o.adresse}</span>}
      </>
    ),
  },
  code_postal: {
    k: 'code_postal', l: 'CP', get: o => o.code_postal || '',
    td: 'text-sm text-gray-600 whitespace-nowrap',
  },
  ville_seule: {
    k: 'ville_seule', l: 'Ville', get: o => o.ville || '', td: 'text-sm text-gray-600 whitespace-nowrap',
  },
  nature: {
    k: 'nature', l: 'Nature du jugement', get: o => natureJugement(o) || '',
    td: 'text-xs', style: { minWidth: 190, maxWidth: 260 },
    cell: o => natureJugement(o)
      ? <span className="text-purple-700 bg-purple-50 rounded px-2 py-1 inline-block" title={natureJugement(o)}>{natureJugement(o)}</span>
      : <span className="text-gray-300">—</span>,
  },
  activite: {
    k: 'activite', l: 'Activité', get: o => o.occupation || '',
    td: 'text-xs text-gray-600', style: { minWidth: 220, maxWidth: 320 },
    cell: o => <span className="line-clamp-3" title={o.occupation || ''}>{o.occupation || '—'}</span>,
  },
  jugement: {
    k: 'jugement', l: 'Jugé le', num: true, get: o => ms(bodacc(o).date_jugement),
    td: 'text-xs text-gray-500 whitespace-nowrap',
    cell: o => bodacc(o).date_jugement ? fmtDate(bodacc(o).date_jugement) : '—',
  },
  publication: {
    k: 'publication', l: 'Publié le', num: true, get: o => ms(o.date_publication_annonce),
    td: 'text-xs text-gray-500 whitespace-nowrap',
    cell: o => o.date_publication_annonce ? fmtDate(o.date_publication_annonce) : '—',
  },
  complement: {
    k: 'complement', l: 'Complément du jugement', get: o => o.points_vigilance || '',
    td: 'text-xs text-amber-700', style: { minWidth: 240, maxWidth: 340 },
    cell: o => <span className="line-clamp-3" title={o.points_vigilance || ''}>{o.points_vigilance || '—'}</span>,
  },
}

const COLONNES_DETAILS = [
  C.score, C.statut, C.adresse, C.ville, C.montant, C.prix_m2, C.surface,
  C.rendement, C.forts, C.vigilance, C.commentaire, C.detecte,
]

// R3 : les deux scénarios de CA après le rendement.
const COLONNES_R3 = [
  C.score, C.statut, C.adresse, C.ville, C.montant, C.prix_m2, C.surface,
  C.rendement, C.ca_naturalia, C.ca_g20, C.forts, C.vigilance, C.commentaire, C.detecte,
]

// R5 : ni prix, ni surface, ni rendement — un dossier BODACC se lit par la
// société, la nature du jugement et l'activité. Le score et les deux scénarios
// de CA sont ceux de R3, dont R5 reprend la grille d'analyse.
const COLONNES_R5 = [
  C.score, C.statut, C.candidat, C.societe, C.ville_seule, C.code_postal, C.nature,
  C.activite, C.ca_naturalia, C.ca_g20, C.jugement, C.publication, C.complement,
  C.commentaire, C.detecte,
]

const colonnesDe = (recherche) =>
  recherche === 'R3' ? COLONNES_R3 : recherche === 'R5' ? COLONNES_R5 : COLONNES_DETAILS

const triDefautDetails = (recherche) => TRI_DEFAUT_DETAILS[recherche] || { k: 'score', desc: true }

function VueDetails({ opps, commentairesParOpp, onOpen, recherche }) {
  const [tri, setTri] = useState(() => triDefautDetails(recherche))

  // Chaque recherche a ses colonnes : le tri en cours n'y survit pas.
  useEffect(() => { setTri(triDefautDetails(recherche)) }, [recherche])

  const cliquer = (k) => setTri(t => t.k === k ? { k, desc: !t.desc } : { k, desc: true })

  const colonnes = colonnesDe(recherche)

  const lignes = useMemo(() => {
    const col = colonnes.find(c => c.k === tri.k) || colonnes[0]
    const val = (o) => col.get(o, commentairesParOpp.get(o.id) || [])
    return [...opps].sort((a, b) => {
      const va = val(a), vb = val(b)
      // Les vides toujours en bas, quel que soit le sens du tri.
      if (va == null || va === '') return 1
      if (vb == null || vb === '') return -1
      const cmp = col.num ? va - vb : String(va).localeCompare(String(vb), 'fr')
      return tri.desc ? -cmp : cmp
    })
  }, [opps, tri, commentairesParOpp, colonnes])

  if (opps.length === 0) {
    return <Empty icon={<Table2 size={40} />} text="Aucune opportunité ne correspond aux filtres." />
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 1450 }}>
        <thead>
          <tr className="bg-gray-50 text-left">
            {colonnes.map(c => (
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
          {lignes.map(o => {
            const cm = commentairesParOpp.get(o.id) || []
            return (
              <tr key={o.id} onClick={() => onOpen(o)}
                className="border-t border-gray-50 hover:bg-blue-50/40 cursor-pointer align-top">
                {colonnes.map(c => {
                  const contenu = c.cell ? c.cell(o, cm) : (c.get(o, cm) || '—')
                  return (
                    <td key={c.k} style={c.style}
                      className={`px-3 py-2.5 ${c.td || ''} ${c.cellClass ? c.cellClass(o) : ''}`}>
                      {contenu}
                    </td>
                  )
                })}
                <td className="px-3 py-2.5">
                  {o.lien && (
                    <a href={o.lien} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      className="text-blue-500 hover:text-blue-700" title="Ouvrir l'annonce">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

// ── Fiche détail ─────────────────────────────────────────────

function DetailModal({ opp, onClose, onStatutChange, onCandidatChange, onCommentAdded }) {
  const { user } = useAuth()
  const [comments, setComments] = useState(null)
  const [newComment, setNewComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [statut, setStatut] = useState(opp.statut)
  const [candidat, setCandidat] = useState(opp.candidat_lab)

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
    // Le select en retour d'insert récupère la ligne créée (avec le profil de
    // l'auteur) pour mettre à jour l'état local ET l'état de la page — sans
    // ça, les encarts de la liste / carte / vue Détails restaient figés
    // jusqu'au rechargement complet de la page.
    const { data, error } = await supabase.from('commentaires')
      .insert({ opportunite_id: opp.id, auteur: user.id, contenu })
      .select('id, opportunite_id, contenu, cree_le, auteur, profiles:auteur(full_name, email)')
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
    const { error } = await supabase.from('opportunites').update({ statut: v }).eq('id', opp.id)
    if (error) { setStatut(opp.statut); alert('Impossible de changer le statut : ' + error.message) }
    else onStatutChange(opp.id, v)
  }

  const changeCandidat = async (v) => {
    setCandidat(v)
    const { error } = await supabase.from('opportunites').update({ candidat_lab: v }).eq('id', opp.id)
    if (error) { setCandidat(opp.candidat_lab); alert('Impossible de changer le candidat labo : ' + error.message) }
    else onCandidatChange?.(opp.id, v)
  }

  const R = RECHERCHES[opp.recherche]
  const estBodacc = opp.recherche === 'R5'
  const B = bodacc(opp)
  // Sur R5, `points_vigilance` reprend le complément du jugement : on ne
  // l'affiche une seconde fois que s'il apporte autre chose.
  const complementRepris = estBodacc && (B.complement || '').trim() === (opp.points_vigilance || '').trim()

  return (
    <Modal
      title={estBodacc
        ? (societe(opp) || `${opp.ville} — ${R.label}`)
        : (opp.adresse || `${opp.ville} — ${R.label}`)}
      onClose={onClose} width="max-w-2xl">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <ScoreBadge score={opp.score} size="lg" />
        <div className="flex-1 min-w-[140px]">
          <p className="text-gray-400 text-xs">{opp.recherche} · {R.label}</p>
          <p className="text-navy font-bold">{opp.code_postal} {opp.ville}</p>
          {estBodacc && opp.adresse && <p className="text-gray-400 text-xs">{opp.adresse}</p>}
        </div>
        <a href={opp.lien} target="_blank" rel="noopener noreferrer"
          className="bg-navy text-white hover:bg-navy-light px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
          {estBodacc ? "Voir l'annonce BODACC" : "Voir l'annonce"} <ExternalLink size={12} />
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

      {/* Candidat laboratoire — arbitrage manuel des associés */}
      {CANDIDAT_LAB_RECHERCHES.includes(opp.recherche) && (
        <div className="mb-5">
          <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Candidat laboratoire</label>
          <div className="flex gap-1.5 flex-wrap">
            {CANDIDAT_LAB.map(c => (
              <button key={c.v} onClick={() => changeCandidat(c.v)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                  candidat === c.v ? c.cls + ' ring-2 ring-offset-1 ring-navy/30' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                }`}>
                {c.l}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Annonce BODACC */}
      {estBodacc && (
        <div className="mb-5 bg-purple-50/60 border border-purple-100 rounded-lg p-3">
          <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2">Annonce BODACC</p>
          <div className="grid sm:grid-cols-2 gap-x-8">
            <div>
              <Row label="Dénomination">{societe(opp)}</Row>
              <Row label="SIREN">{B.siren}</Row>
              <Row label="Nature">{natureJugement(opp)}</Row>
              <Row label="Famille">{B.famille}</Row>
            </div>
            <div>
              <Row label="Tribunal">{B.tribunal}</Row>
              <Row label="Date du jugement">{B.date_jugement ? fmtDate(B.date_jugement) : null}</Row>
              <Row label="Publiée le">{opp.date_publication_annonce ? fmtDate(opp.date_publication_annonce) : null}</Row>
              <Row label="Parution">{B.parution ? `${B.parution}${B.numero_annonce ? ` · annonce n° ${B.numero_annonce}` : ''}` : null}</Row>
            </div>
          </div>
          {opp.occupation && (
            <div className="mt-3">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Activité</p>
              <p className="text-sm text-gray-700">{opp.occupation}</p>
            </div>
          )}
          {(B.complement || opp.points_vigilance) && (
            <div className="mt-3">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Complément du jugement</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{B.complement || opp.points_vigilance}</p>
              <p className="text-[11px] text-gray-400 mt-1">
                Mandataire et délai de dépôt des offres figurent en général dans ce complément — à confirmer auprès du greffe.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Données */}
      {!estBodacc && (
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
      )}

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

      {(opp.points_forts || (opp.points_vigilance && !complementRepris)) && (
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          {opp.points_forts && (
            <div className="bg-green-50 rounded-lg p-3 text-sm">
              <p className="text-green-700 font-bold text-xs uppercase tracking-wide mb-1">Points forts</p>
              <p className="text-gray-700 whitespace-pre-line">{opp.points_forts}</p>
            </div>
          )}
          {opp.points_vigilance && !complementRepris && (
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
            {/* Un critère à null n'a pas pu être documenté (fréquent sur R5, où
                le BODACC ne donne ni loyer ni surface) : le score est alors
                renormalisé sur les seuls critères évalués. */}
            {Object.entries(opp.score_detail).map(([crit, pts]) => (
              <div key={crit} className="flex justify-between text-sm px-3 py-1.5 bg-gray-50 rounded">
                <span className="text-gray-600">{crit}</span>
                {pts == null
                  ? <span className="text-gray-400 italic text-xs">non évaluable</span>
                  : <span className="font-bold text-navy">{pts}</span>}
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

// ── Rapports quotidiens ──────────────────────────────────────

function RapportsModal({ runs, onClose }) {
  const [selected, setSelected] = useState(runs.find(r => r.rapport) || null)

  return (
    <Modal title="Rapports quotidiens" onClose={onClose} width="max-w-3xl">
      {selected ? (
        <>
          {runs.filter(r => r.rapport).length > 1 && (
            <button onClick={() => setSelected(null)}
              className="text-blue-600 hover:text-blue-800 text-xs font-semibold cursor-pointer inline-flex items-center gap-1 mb-4">
              <ChevronLeft size={13} />Tous les rapports
            </button>
          )}
          <div className="rapport-md" dangerouslySetInnerHTML={{ __html: marked.parse(selected.rapport || '') }} />
        </>
      ) : (
        <div className="space-y-2">
          {runs.filter(r => r.rapport).map(r => (
            <button key={r.id} onClick={() => setSelected(r)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer text-left transition-colors">
              <span className="font-bold text-navy text-sm">
                {new Date(r.date_run).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span className="text-gray-400 text-xs shrink-0">
                {r.nouvelles ?? 0} nouvelle{(r.nouvelles ?? 0) > 1 ? 's' : ''} · {r.annonces_analysees ?? 0} analysées
              </span>
            </button>
          ))}
          {runs.filter(r => r.rapport).length === 0 && (
            <p className="text-gray-300 text-sm text-center py-8">Aucun rapport disponible.</p>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Vue carte ────────────────────────────────────────────────

function MapView({ opps, onOpen, commentairesParOpp }) {
  const geo = opps.filter(o => o.latitude && o.longitude)
  const sansGeo = opps.length - geo.length

  // Centre Île-de-France ; recentré sur le barycentre si des points existent
  const center = geo.length
    ? [geo.reduce((s, o) => s + Number(o.latitude), 0) / geo.length,
       geo.reduce((s, o) => s + Number(o.longitude), 0) / geo.length]
    : [48.8566, 2.3522]

  return (
    <>
      {geo.length === 0 ? (
        <Empty icon={<MapIcon size={40} />} text="Aucune opportunité géolocalisée pour cette sélection." />
      ) : (
        <Card className="overflow-hidden" style={{ height: 'clamp(420px, calc(100vh - 340px), 720px)', isolation: 'isolate' }}>
          <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {geo.map(o => {
              const c = scoreColor(o.score)
              return (
                <CircleMarker
                  key={o.id}
                  center={[Number(o.latitude), Number(o.longitude)]}
                  radius={o.geo_approx ? 9 : 11}
                  pathOptions={{
                    color: c, fillColor: c,
                    fillOpacity: o.geo_approx ? 0.35 : 0.8,
                    weight: 2, dashArray: o.geo_approx ? '3 3' : null,
                  }}
                >
                  <Popup>
                    <div className="text-xs leading-relaxed min-w-[190px]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white font-bold shrink-0" style={{ background: c }}>
                          {o.score ?? '—'}
                        </span>
                        <span className="font-bold">{o.recherche} · {RECHERCHES[o.recherche].label}</span>
                      </div>
                      <p className="font-semibold">{o.adresse || 'Adresse à confirmer'}</p>
                      <p className="text-gray-500">{o.code_postal} {o.ville}</p>
                      <p className="mt-1">
                        {o.type_offre === 'location'
                          ? (o.loyer_annuel ? <strong>{fmtNum(o.loyer_annuel)} €/an</strong> : 'Loyer : nous consulter')
                          : (o.prix ? <strong>{fmtNum(o.prix)} €</strong> : 'Prix : nous consulter')}
                        {o.surface_totale ? ` · ${fmtNum(o.surface_totale)} m²` : ''}
                      </p>
                      {o.geo_approx && <p className="text-amber-600 mt-1">Localisation approximative (adresse non communiquée)</p>}
                      <EncartCommentaire commentaires={commentairesParOpp?.get(o.id) || []} compact />
                      <button
                        onClick={() => onOpen(o)}
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

      {/* Légende par score */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500" /> Score ≥ 70</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500" /> 50–69</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500" /> &lt; 50</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-400" /> Non scoré</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-dashed border-gray-400" /> Localisation approximative</span>
      </div>

      {sansGeo > 0 && (
        <p className="text-gray-400 text-[11px] mt-2">
          {sansGeo} opportunité{sansGeo > 1 ? 's' : ''} sans coordonnées (adresse non communiquée) — visible{sansGeo > 1 ? 's' : ''} en vue liste uniquement.
        </p>
      )}
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────

// `recherches` restreint l'écran à un sous-ensemble de R1-R5 : l'onglet
// Opportunités monte deux instances — Supermarchés (R3+R5) et Immobilier
// (R1+R2+R4) — sur les mêmes données, sans en dupliquer la logique.
export default function Pipeline({ recherches, titre, sousTitre }) {
  const KEYS = recherches?.length ? recherches : Object.keys(RECHERCHES)
  const RECH = Object.fromEntries(KEYS.map(k => [k, RECHERCHES[k]]))
  const [opps, setOpps] = useState(null)
  const [runs, setRuns] = useState([])
  const [commentaires, setCommentaires] = useState([])
  const [tab, setTab] = useState(KEYS[0])
  const [view, setView] = useState('liste')
  const [mapRech, setMapRech] = useState(() => Object.fromEntries(KEYS.map(k => [k, true])))
  const [detail, setDetail] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showRapports, setShowRapports] = useState(false)

  const [fStatut, setFStatut] = useState('travail')
  const [fVille, setFVille] = useState('')
  const [fScoreMin, setFScoreMin] = useState('')
  const [fPrixMax, setFPrixMax] = useState('')
  // null = tri par défaut de la recherche affichée, tant que rien n'a été choisi.
  const [fTri, setFTri] = useState(null)

  const load = async () => {
    const [o, r, c] = await Promise.all([
      supabase.from('opportunites').select('*'),
      supabase.from('runs').select('*').order('date_run', { ascending: false }).limit(60),
      // Tous les commentaires d'un coup : ils s'affichent désormais sur les
      // cartes de la liste, la carte géographique et la vue Détails.
      supabase.from('commentaires')
        .select('opportunite_id, contenu, cree_le, auteur, profiles:auteur(full_name, email)')
        .order('cree_le', { ascending: false }),
    ])
    setOpps(o.data || [])
    setRuns(r.data || [])
    setCommentaires(c.data || [])
  }

  useEffect(() => { load() }, [])

  const onStatutChange = (id, statut) =>
    setOpps(prev => prev.map(o => o.id === id ? { ...o, statut } : o))

  const onCandidatChange = (id, candidat_lab) =>
    setOpps(prev => prev.map(o => o.id === id ? { ...o, candidat_lab } : o))

  const triListe = fTri || TRI_DEFAUT_LISTE[tab] || 'score'

  const commentairesParOpp = useMemo(() => {
    const m = new Map()
    for (const c of commentaires) {
      if (!m.has(c.opportunite_id)) m.set(c.opportunite_id, [])
      m.get(c.opportunite_id).push(c)
    }
    return m
  }, [commentaires])

  const villes = useMemo(() =>
    [...new Set((opps || []).filter(o => KEYS.includes(o.recherche)).map(o => o.ville).filter(Boolean))].sort(), [opps])

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
    return [...list].sort(tri[triListe])
  }

  const filtered = useMemo(() =>
    opps ? filterAndSort(opps.filter(o => o.recherche === tab && !o.hors_critere)) : [],
    [opps, tab, fStatut, fVille, fScoreMin, fPrixMax, triListe])

  const horsCriteres = useMemo(() =>
    opps ? filterAndSort(opps.filter(o => o.recherche === tab && o.hors_critere)) : [],
    [opps, tab, fStatut, fVille, fScoreMin, fPrixMax, triListe])

  const mapOpps = useMemo(() =>
    opps ? filterAndSort(opps.filter(o => KEYS.includes(o.recherche) && mapRech[o.recherche])) : [],
    [opps, mapRech, fStatut, fVille, fScoreMin, fPrixMax, triListe])

  if (opps === null) return <Spinner />

  const lastRun = runs[0] || null
  const actives = (r) => opps.filter(o => o.recherche === r && !o.hors_critere && STATUTS_TRAVAIL.includes(o.statut)).length
  const nouveaux = opps.filter(o => KEYS.includes(o.recherche) && isNouveau(o) && !o.hors_critere && o.statut === 'active').length

  return (
    <div>
      <PageHeader title={titre || "Veille immobilière"} sub={sousTitre || "Le pipeline d'acquisition, alimenté chaque matin"} />

      {/* Bandeau de synthèse */}
      <Card className="p-4 mb-6">
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 text-center ${
          KEYS.length + 2 === 4 ? 'lg:grid-cols-4' : KEYS.length + 2 === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-7'
        }`}>
          <div>
            <p className="text-gray-400 text-[11px] uppercase tracking-wide font-bold">Dernier run</p>
            <p className="text-navy font-extrabold text-sm mt-1">
              {lastRun ? new Date(lastRun.date_run).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
            </p>
          </div>
          {Object.entries(RECH).map(([k, R]) => (
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

      {/* Barre : bascule Liste/Carte + Rapports + Filtres */}
      <div className="flex gap-1.5 mb-4 items-center">
        <div className="inline-flex bg-white border border-gray-200 rounded-lg p-0.5">
          <button onClick={() => setView('liste')}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors ${
              view === 'liste' ? 'bg-navy text-white' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <LayoutGrid size={14} /><span className="hidden sm:inline">Liste</span>
          </button>
          <button onClick={() => setView('carte')}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors ${
              view === 'carte' ? 'bg-navy text-white' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <MapIcon size={14} /><span className="hidden sm:inline">Carte</span>
          </button>
          <button onClick={() => setView('details')}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors ${
              view === 'details' ? 'bg-navy text-white' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Table2 size={14} /><span className="hidden sm:inline">Détails</span>
          </button>
        </div>
        <button onClick={() => setShowRapports(true)}
          className="ml-auto px-3 py-2 rounded-lg text-sm cursor-pointer inline-flex items-center gap-1.5 bg-white text-gray-400 border border-gray-200 hover:bg-gray-50">
          <FileText size={14} /><span className="hidden sm:inline">Rapports</span>
        </button>
        <button onClick={() => setShowFilters(v => !v)}
          className={`px-3 py-2 rounded-lg text-sm cursor-pointer inline-flex items-center gap-1.5 ${
            showFilters ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-white text-gray-400 border border-gray-200'
          }`}>
          <SlidersHorizontal size={14} /><span className="hidden sm:inline">Filtres</span>
        </button>
      </div>

      {/* Sélecteur de recherche : onglets (liste, détails) ou cases superposables (carte) */}
      {view !== 'carte' ? (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {Object.entries(RECH).map(([k, { label, I }]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                tab === k ? 'bg-navy text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
              }`}>
              <I size={14} />{k} · {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 items-center">
          <span className="text-gray-400 text-xs shrink-0 mr-1">Afficher :</span>
          {Object.entries(RECH).map(([k, { label, I }]) => {
            const on = mapRech[k]
            return (
              <button key={k} onClick={() => setMapRech(m => ({ ...m, [k]: !m[k] }))}
                className={`px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 transition-colors border ${
                  on ? 'bg-navy text-white border-navy' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
                }`}>
                <I size={14} />{k} · {label}
              </button>
            )
          })}
        </div>
      )}

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
            <Sel label="Tri" value={triListe} onChange={e => setFTri(e.target.value)} className="!mb-0"
              options={[{ v: 'score', l: 'Score ↓' }, { v: 'prix', l: 'Prix ↑' }, { v: 'date', l: 'Plus récent' }]} />
          </div>
        </Card>
      )}

      {view === 'carte' ? (
        <MapView opps={mapOpps} onOpen={setDetail} commentairesParOpp={commentairesParOpp} />
      ) : view === 'details' ? (
        <>
          <p className="text-gray-400 text-xs mb-3">
            {RECHERCHES[tab].sub} — {filtered.length + horsCriteres.length} {nomLigne(tab)}{filtered.length + horsCriteres.length > 1 ? 's' : ''} ·
            cliquez sur un en-tête pour trier, sur une ligne pour ouvrir la fiche
          </p>
          <VueDetails opps={[...filtered, ...horsCriteres]} commentairesParOpp={commentairesParOpp} onOpen={setDetail} recherche={tab} />
        </>
      ) : (
        <>
          {/* Sous-titre de section */}
          <p className="text-gray-400 text-xs mb-3">
            {RECHERCHES[tab].sub} — {filtered.length} {nomLigne(tab)}{filtered.length > 1 ? 's' : ''}
          </p>

          {/* Cartes */}
          {filtered.length === 0 ? (
            <Empty icon={<Radar size={40} />} text="Aucune opportunité ne correspond aux filtres." />
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(o => <OppCard key={o.id} o={o} onOpen={setDetail} commentaires={commentairesParOpp.get(o.id) || []} />)}
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
                {horsCriteres.map(o => <OppCard key={o.id} o={o} onOpen={setDetail} commentaires={commentairesParOpp.get(o.id) || []} />)}
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-gray-300 text-[11px] text-center mt-10 max-w-xl mx-auto">
        Estimations d'aide à la décision — données d'annonces à vérifier.
        Ne constitue pas un conseil juridique, fiscal ou en investissement.
      </p>

      {detail && <DetailModal opp={detail} onClose={() => setDetail(null)} onStatutChange={onStatutChange}
        onCandidatChange={onCandidatChange}
        onCommentAdded={c => setCommentaires(prev => [c, ...prev])} />}
      {showRapports && <RapportsModal runs={runs} onClose={() => setShowRapports(false)} />}
    </div>
  )
}
