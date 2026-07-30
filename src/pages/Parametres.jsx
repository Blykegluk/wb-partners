import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/Auth'
import { useSociete } from '../contexts/Societe'
import { fmtDate } from '../lib/utils'
import { PageHeader, Card, Modal, Field, Sel, Grid2, Btn, Badge, Empty } from '../components/UI'
import { CheckCircle, UserPlus, Trash2, Shield, Landmark, RefreshCw, Unlink, Plus, AlertTriangle, Users } from 'lucide-react'

const FUNCTIONS_URL_TOP = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

const TABS = [
  { key: 'societe', label: 'Société' },
  { key: 'actionnariat', label: 'Actionnariat' },
  { key: 'membres', label: 'Membres' },
  { key: 'banque', label: 'Banque' },
  { key: 'envois', label: 'Envois' },
]

export default function Parametres({ navState, setNavState }) {
  const { user } = useAuth()
  const { selected, membres, isAdmin, reload } = useSociete()
  const [tab, setTab] = useState('societe')

  // Lien profond : navigate('parametres', { tab: 'banque' })
  useEffect(() => {
    if (navState?.tab && TABS.find(t => t.key === navState.tab)) {
      setTab(navState.tab)
      setNavState?.(null)
    }
  }, [navState, setNavState])

  return (
    <div>
      <PageHeader title="Paramètres" sub="Configuration de la société" />

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${tab === t.key ? 'bg-white text-navy shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: tab === 'societe' ? 'block' : 'none' }}>
        <SocieteTab />
      </div>
      <div style={{ display: tab === 'actionnariat' ? 'block' : 'none' }}>
        <ActionnariatTab />
      </div>
      <div style={{ display: tab === 'membres' ? 'block' : 'none' }}>
        <MembresTab />
      </div>
      <div style={{ display: tab === 'banque' ? 'block' : 'none' }}>
        <BanqueTab />
      </div>
      <div style={{ display: tab === 'envois' ? 'block' : 'none' }}>
        <EnvoisTab />
      </div>
    </div>
  )
}

// ── Envois tab ──────────────────────────────────────────
// Paramétrage des envois automatiques : quittances, avis d'échéance et
// paliers de relance. Les emails partent de contact@wbpartners.fr via la
// fonction auto-documents, déclenchée chaque matin par le cron de la base.
// Sans ligne envois_config, la société n'envoie rien : opt-in explicite.
function EnvoisTab() {
  const { selected, baux, envoisConfig, isAdmin, reload } = useSociete()
  const [f, setF] = useState({
    quittance_auto: false, avis_actif: false, avis_jour: 1,
    relance_apres_jours: 5, mise_en_demeure_apres_jours: 15, commandement_apres_jours: 30,
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (envoisConfig) {
      setF({
        quittance_auto: envoisConfig.quittance_auto,
        avis_actif: envoisConfig.avis_jour != null,
        avis_jour: envoisConfig.avis_jour ?? 1,
        relance_apres_jours: envoisConfig.relance_apres_jours,
        mise_en_demeure_apres_jours: envoisConfig.mise_en_demeure_apres_jours,
        commandement_apres_jours: envoisConfig.commandement_apres_jours,
      })
    }
  }, [envoisConfig])

  const u = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    const { error } = await supabase.from('envois_config').upsert({
      societe_id: selected.id,
      quittance_auto: f.quittance_auto,
      avis_jour: f.avis_actif ? Number(f.avis_jour) : null,
      relance_apres_jours: Number(f.relance_apres_jours),
      mise_en_demeure_apres_jours: Number(f.mise_en_demeure_apres_jours),
      commandement_apres_jours: Number(f.commandement_apres_jours),
      updated_at: new Date().toISOString(),
    })
    if (error) { alert(`Enregistrement impossible : ${error.message}`) ; return }
    reload()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const bauxAvecAuto = baux.filter(b => b.actif && (b.auto_avis || b.auto_relance))

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold text-navy">Envois automatiques</h3>
        {isAdmin && (
          <Btn onClick={save}>
            {saved ? <><CheckCircle size={15} /> Enregistré</> : 'Enregistrer'}
          </Btn>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-6">
        Les documents partent par email depuis <strong className="text-gray-500">contact@wbpartners.fr</strong>,
        chaque matin vers 8h30. Chaque envoi est tracé dans le suivi des loyers.
        {!envoisConfig && ' Tant que rien n’est enregistré ici, aucun envoi automatique n’a lieu.'}
      </p>

      <h4 className="text-xs font-bold uppercase text-gray-400 mb-3">Quittances</h4>
      <label className="flex items-center gap-2 mb-1 cursor-pointer text-sm text-gray-700">
        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-navy"
          checked={f.quittance_auto} disabled={!isAdmin}
          onChange={e => u('quittance_auto', e.target.checked)} />
        Envoyer la quittance dès qu'un loyer est rapproché d'un virement
      </label>
      <p className="text-xs text-gray-400 mb-6 ml-6">
        La quittance n'est jamais envoyée sur un simple « payé » coché à la main :
        il faut un virement constaté en banque.
      </p>

      <h4 className="text-xs font-bold uppercase text-gray-400 mb-3">Avis d'échéance</h4>
      <label className="flex items-center gap-2 mb-2 cursor-pointer text-sm text-gray-700">
        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-navy"
          checked={f.avis_actif} disabled={!isAdmin}
          onChange={e => u('avis_actif', e.target.checked)} />
        Envoyer l'avis d'échéance du mois en cours
      </label>
      {f.avis_actif && (
        <div className="ml-6 mb-2 w-56">
          <Sel label="Jour d'envoi" value={f.avis_jour} disabled={!isAdmin}
            onChange={e => u('avis_jour', e.target.value)}
            options={Array.from({ length: 28 }, (_, i) => ({ v: i + 1, l: `Le ${i + 1} du mois` }))} />
        </div>
      )}
      <p className="text-xs text-gray-400 mb-6 ml-6">
        Seuls les baux dont la case « Envoyer avis d'échéance automatiquement »
        est cochée (fiche du bail, page Patrimoine) sont concernés.
      </p>

      <h4 className="text-xs font-bold uppercase text-gray-400 mb-3">Paliers de relance</h4>
      <p className="text-xs text-gray-400 mb-3">
        Délais en jours de retard depuis le 1er du mois dû. Chaque document n'est
        envoyé qu'une fois par échéance, aux baux dont la case « Envoyer relances
        automatiquement » est cochée.
      </p>
      <Grid2>
        <Field label="Relance amiable après (jours)" type="number" min="1"
          value={f.relance_apres_jours} disabled={!isAdmin}
          onChange={e => u('relance_apres_jours', e.target.value)} />
        <Field label="Mise en demeure après (jours)" type="number" min="1"
          value={f.mise_en_demeure_apres_jours} disabled={!isAdmin}
          onChange={e => u('mise_en_demeure_apres_jours', e.target.value)} />
      </Grid2>
      <div className="w-1/2 pr-2">
        <Field label="Commandement proposé après (jours)" type="number" min="1"
          value={f.commandement_apres_jours} disabled={!isAdmin}
          onChange={e => u('commandement_apres_jours', e.target.value)} />
      </div>
      <p className="text-xs text-gray-400 mb-6">
        Le commandement de payer n'est <strong>jamais envoyé par email</strong> : il n'a de
        valeur que signifié par commissaire de justice. Passé ce délai, l'application
        le propose simplement en PDF dans le suivi des loyers.
      </p>

      <h4 className="text-xs font-bold uppercase text-gray-400 mb-3">Baux concernés</h4>
      {bauxAvecAuto.length === 0 ? (
        <p className="text-xs text-gray-400">
          Aucun bail actif n'a d'envoi automatique activé. Les cases se cochent
          sur la fiche de chaque bail, page Patrimoine.
        </p>
      ) : (
        <div className="space-y-1.5">
          {bauxAvecAuto.map(b => (
            <div key={b.id} className="flex items-center gap-2 text-sm text-gray-600">
              <Shield size={13} className="text-gray-300" />
              Bail du {fmtDate(b.date_debut)}
              <span className="text-xs text-gray-400">
                {[b.auto_avis && 'avis', b.auto_relance && 'relances'].filter(Boolean).join(' + ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Société tab ─────────────────────────────────────────
function SocieteTab() {
  const { selected, isAdmin, reload } = useSociete()
  const [f, setF] = useState({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (selected) setF({ ...selected })
  }, [selected])

  const u = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    const { id, _role, created_at, owner_id, ...data } = f
    const { error } = await supabase.from('societe').update(data).eq('id', selected.id)
    if (error) return
    reload()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-bold text-navy">Identité</h3>
        {isAdmin && (
          <Btn onClick={save}>
            {saved ? <><CheckCircle size={15} /> Enregistré</> : 'Enregistrer'}
          </Btn>
        )}
      </div>
      <Grid2>
        <Field label="Nom légal *" value={f.nom || ''} onChange={e => u('nom', e.target.value)} disabled={!isAdmin} />
        <Field label="Nom d'affichage" value={f.nom_affiche || ''} onChange={e => u('nom_affiche', e.target.value)} disabled={!isAdmin} />
      </Grid2>
      <Grid2>
        <Field label="SIRET" value={f.siret || ''} onChange={e => u('siret', e.target.value)} disabled={!isAdmin} />
        <Field label="RCS" value={f.rcs || ''} onChange={e => u('rcs', e.target.value)} disabled={!isAdmin} />
      </Grid2>
      <Grid2>
        <Field label="APE" value={f.ape || ''} onChange={e => u('ape', e.target.value)} disabled={!isAdmin} />
        <Field label="TVA Intracommunautaire" value={f.tva_intracommunautaire || ''} onChange={e => u('tva_intracommunautaire', e.target.value)} disabled={!isAdmin} />
      </Grid2>
      <Field label="Capital" value={f.capital || ''} onChange={e => u('capital', e.target.value)} disabled={!isAdmin} />

      <h3 className="text-sm font-bold text-navy mb-4 mt-8">Contact</h3>
      <Field label="Adresse" value={f.adresse || ''} onChange={e => u('adresse', e.target.value)} disabled={!isAdmin} />
      <Grid2>
        <Field label="Code postal" value={f.code_postal || ''} onChange={e => u('code_postal', e.target.value)} disabled={!isAdmin} />
        <Field label="Ville" value={f.ville || ''} onChange={e => u('ville', e.target.value)} disabled={!isAdmin} />
      </Grid2>
      <Grid2>
        <Field label="Téléphone" value={f.telephone || ''} onChange={e => u('telephone', e.target.value)} disabled={!isAdmin} />
        <Field label="Email" type="email" value={f.email || ''} onChange={e => u('email', e.target.value)} disabled={!isAdmin} />
      </Grid2>

      <h3 className="text-sm font-bold text-navy mb-4 mt-8">Coordonnées bancaires</h3>
      <Field label="IBAN" value={f.iban || ''} onChange={e => u('iban', e.target.value)} disabled={!isAdmin} />
      <Grid2>
        <Field label="BIC" value={f.bic || ''} onChange={e => u('bic', e.target.value)} disabled={!isAdmin} />
        <Field label="Nom de la banque" value={f.nom_banque || ''} onChange={e => u('nom_banque', e.target.value)} disabled={!isAdmin} />
      </Grid2>
      <Field label="Adresse de la banque" value={f.adresse_banque || ''} onChange={e => u('adresse_banque', e.target.value)} disabled={!isAdmin} />
    </Card>
  )
}

// ── Actionnariat tab ────────────────────────────────────
//
// L'actionnariat relie une PERSONNE (annuaire partagé entre toutes les
// sociétés) à la société courante avec un pourcentage de capital. La fiche
// d'une personne — coordonnées, identité — est éditable ici et sert aux
// courriers et rapports.
const PERSONNE_NOUVELLE = '__nouvelle__'

const EMPTY_FICHE = {
  nom: '', type: 'physique', siret: '', email: '', telephone: '',
  adresse: '', code_postal: '', ville: '', pays: 'France',
  date_naissance: '', lieu_naissance: '', nationalite: '', notes: '',
}

function ActionnariatTab() {
  const { selected, actionnaires, personnes, bienActionnaires, biens, isAdmin, reload } = useSociete()

  // Modale « participation au capital »
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [f, setF] = useState({ personne_id: '', nom_nouveau: '', type_nouveau: 'physique', pourcentage: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Modale « fiche personne »
  const [ficheOpen, setFicheOpen] = useState(false)
  const [fichePersonne, setFichePersonne] = useState(null)
  const [fiche, setFiche] = useState(EMPTY_FICHE)
  const [ficheSaving, setFicheSaving] = useState(false)
  const [ficheError, setFicheError] = useState('')

  const total = actionnaires.reduce((s, a) => s + Number(a.pourcentage || 0), 0)
  const totalRounded = Math.round(total * 100) / 100
  const isComplete = Math.abs(total - 100) < 0.01
  const isOver = total > 100.01

  const personneOf = (a) => personnes.find(p => p.id === a.personne_id) || null
  // Repli sur les colonnes historiques pour les lignes antérieures à l'annuaire.
  const nomOf = (a) => personneOf(a)?.nom || a.nom || '—'
  const typeOf = (a) => personneOf(a)?.type || a.type || 'physique'
  const siretOf = (a) => personneOf(a)?.siret || a.siret || null

  // Nombre de biens co-détenus en direct par cette personne (toutes sociétés
  // chargées) — utile pour comprendre d'où vient sa quote-part.
  const nbBiensDirects = (personneId) =>
    bienActionnaires.filter(x => x.personne_id === personneId).length

  // ── Participation au capital ──────────────────────────
  const openAdd = () => {
    setEditing(null)
    setF({ personne_id: '', nom_nouveau: '', type_nouveau: 'physique', pourcentage: '', notes: '' })
    setError('')
    setOpen(true)
  }

  const openEdit = (a) => {
    setEditing(a)
    setF({
      personne_id: a.personne_id || '',
      nom_nouveau: '',
      type_nouveau: 'physique',
      pourcentage: a.pourcentage ?? '',
      notes: a.notes || '',
    })
    setError('')
    setOpen(true)
  }

  const save = async () => {
    setError('')
    if (!f.personne_id) { setError('Sélectionnez une personne.'); return }
    if (f.personne_id === PERSONNE_NOUVELLE && !f.nom_nouveau.trim()) {
      setError('Indiquez le nom de la personne.')
      return
    }
    const pct = Number(f.pourcentage)
    if (isNaN(pct) || pct < 0 || pct > 100) { setError('Le pourcentage doit être entre 0 et 100.'); return }

    setSaving(true)

    let personneId = f.personne_id
    if (personneId === PERSONNE_NOUVELLE) {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: np, error: pe } = await supabase.from('personnes').insert({
        created_by: user.id,
        nom: f.nom_nouveau.trim(),
        type: f.type_nouveau,
      }).select().single()
      if (pe) { setError(pe.message); setSaving(false); return }
      personneId = np.id
    }

    const p = personnes.find(x => x.id === personneId)
    const payload = {
      societe_id: selected.id,
      personne_id: personneId,
      // Colonnes historiques tenues à jour pour compatibilité descendante.
      nom: p?.nom || f.nom_nouveau.trim(),
      type: p?.type || f.type_nouveau,
      siret: p?.siret || null,
      pourcentage: pct,
      notes: f.notes.trim() || null,
    }

    const { error: e } = editing
      ? await supabase.from('actionnaires').update(payload).eq('id', editing.id)
      : await supabase.from('actionnaires').insert(payload)

    setSaving(false)
    if (e) { setError(e.message); return }
    setOpen(false)
    reload()
  }

  const del = async (a) => {
    if (!confirm(`Retirer « ${nomOf(a)} » de l'actionnariat de ${selected?.nom} ?\n\nSa fiche reste dans l'annuaire et ses éventuelles détentions de biens sont conservées.`)) return
    await supabase.from('actionnaires').delete().eq('id', a.id)
    reload()
  }

  // ── Fiche personne ────────────────────────────────────
  const openFiche = (p) => {
    setFichePersonne(p)
    setFiche({
      nom: p.nom || '', type: p.type || 'physique', siret: p.siret || '',
      email: p.email || '', telephone: p.telephone || '',
      adresse: p.adresse || '', code_postal: p.code_postal || '',
      ville: p.ville || '', pays: p.pays || 'France',
      date_naissance: p.date_naissance || '', lieu_naissance: p.lieu_naissance || '',
      nationalite: p.nationalite || '', notes: p.notes || '',
    })
    setFicheError('')
    setFicheOpen(true)
  }

  const saveFiche = async () => {
    setFicheError('')
    if (!fiche.nom.trim()) { setFicheError('Le nom est requis.'); return }
    setFicheSaving(true)
    const payload = {
      nom: fiche.nom.trim(),
      type: fiche.type,
      siret: fiche.siret.trim() || null,
      email: fiche.email.trim() || null,
      telephone: fiche.telephone.trim() || null,
      adresse: fiche.adresse.trim() || null,
      code_postal: fiche.code_postal.trim() || null,
      ville: fiche.ville.trim() || null,
      pays: fiche.pays.trim() || null,
      date_naissance: fiche.date_naissance || null,
      lieu_naissance: fiche.lieu_naissance.trim() || null,
      nationalite: fiche.nationalite.trim() || null,
      notes: fiche.notes.trim() || null,
    }
    const { error: e } = await supabase.from('personnes').update(payload).eq('id', fichePersonne.id)
    if (!e) {
      // Garde les colonnes historiques d'actionnaires alignées sur la fiche.
      await supabase.from('actionnaires')
        .update({ nom: payload.nom, type: payload.type, siret: payload.siret })
        .eq('personne_id', fichePersonne.id)
    }
    setFicheSaving(false)
    if (e) { setFicheError(e.message); return }
    setFicheOpen(false)
    reload()
  }

  // Personnes déjà actionnaires de CETTE société (hors ligne éditée).
  const dejaActionnaires = actionnaires
    .filter(a => a.id !== editing?.id && a.personne_id)
    .map(a => a.personne_id)

  const optionsPersonnes = [
    { v: '', l: 'Sélectionner une personne' },
    ...personnes
      .filter(p => !dejaActionnaires.includes(p.id))
      .map(p => ({ v: p.id, l: p.type === 'morale' ? `${p.nom} (personne morale)` : p.nom })),
    { v: PERSONNE_NOUVELLE, l: '➕ Nouvelle personne…' },
  ]

  // Personnes de l'annuaire non actionnaires de la société courante.
  const autresPersonnes = personnes.filter(p => !actionnaires.some(a => a.personne_id === p.id))

  return (
    <div>
      <Card className="p-6 mb-4">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-bold text-navy">Répartition du capital</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Total des participations enregistrées
            </p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${isComplete ? 'text-emerald-600' : isOver ? 'text-red-500' : 'text-amber-500'}`}>
              {totalRounded.toFixed(2).replace('.', ',')}%
            </p>
            <p className={`text-xs font-semibold ${isComplete ? 'text-emerald-600' : isOver ? 'text-red-500' : 'text-amber-500'}`}>
              {isComplete ? 'Capital complet' : isOver ? 'Dépasse 100%' : `Reste ${(100 - totalRounded).toFixed(2).replace('.', ',')}%`}
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
          <div
            className={`h-full transition-all ${isComplete ? 'bg-emerald-500' : isOver ? 'bg-red-500' : 'bg-amber-400'}`}
            style={{ width: `${Math.min(total, 100)}%` }}
          />
        </div>
        {!isComplete && !isOver && actionnaires.length > 0 && (
          <div className="flex items-center gap-2 mt-3 text-xs text-amber-600">
            <AlertTriangle size={14} />
            La somme des participations doit atteindre 100%.
          </div>
        )}
        {isOver && (
          <div className="flex items-center gap-2 mt-3 text-xs text-red-500">
            <AlertTriangle size={14} />
            La somme dépasse 100% : corrigez une ou plusieurs participations.
          </div>
        )}
      </Card>

      {isAdmin && (
        <div className="flex justify-end mb-4">
          <Btn onClick={openAdd}><Plus size={15} /> Ajouter un actionnaire</Btn>
        </div>
      )}

      {actionnaires.length === 0 ? (
        <Empty icon={<Users size={40} />} text="Aucun actionnaire enregistré." />
      ) : (
        <div className="space-y-2">
          {actionnaires.map(a => {
            const p = personneOf(a)
            const nbDirects = a.personne_id ? nbBiensDirects(a.personne_id) : 0
            return (
              <Card key={a.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-navy/5 flex items-center justify-center flex-shrink-0">
                      <Users size={16} className="text-navy" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-navy text-sm truncate">{nomOf(a)}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                          {typeOf(a) === 'morale' ? 'Personne morale' : 'Personne physique'}
                        </span>
                        {nbDirects > 0 && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">
                            {nbDirects} bien{nbDirects > 1 ? 's' : ''} en direct
                          </span>
                        )}
                      </div>
                      {siretOf(a) && <p className="text-xs text-gray-400">SIRET : {siretOf(a)}</p>}
                      {p?.email && <p className="text-xs text-gray-400">{p.email}</p>}
                      {a.notes && <p className="text-xs text-gray-400 italic mt-0.5">{a.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="text-lg font-bold text-navy">{Number(a.pourcentage).toFixed(2).replace('.', ',')}%</p>
                    {isAdmin && (
                      <>
                        {p && (
                          <button onClick={() => openFiche(p)}
                            className="text-xs font-semibold px-2 py-1 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer">
                            Fiche
                          </button>
                        )}
                        <button onClick={() => openEdit(a)}
                          className="text-xs font-semibold px-2 py-1 rounded-lg hover:bg-gray-100 text-blue-500 cursor-pointer">
                          Part
                        </button>
                        <button onClick={() => del(a)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Annuaire : personnes connues non actionnaires de cette société */}
      {autresPersonnes.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
            Autres personnes de l'annuaire ({autresPersonnes.length})
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            Personnes utilisées sur vos autres sociétés ou comme co-détenteurs de biens.
            Elles restent sélectionnables partout, sans être ressaisies.
          </p>
          <div className="space-y-2">
            {autresPersonnes.map(p => (
              <Card key={p.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Users size={14} className="text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy truncate">{p.nom}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {[p.email, p.ville].filter(Boolean).join(' · ') || 'Fiche incomplète'}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <button onClick={() => openFiche(p)}
                      className="text-xs font-semibold px-2 py-1 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer flex-shrink-0">
                      Fiche
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Modale participation */}
      {open && (
        <Modal title={editing ? 'Modifier la participation' : 'Ajouter un actionnaire'} onClose={() => setOpen(false)}>
          <Sel label="Personne *" value={f.personne_id}
            onChange={e => setF(p => ({ ...p, personne_id: e.target.value }))}
            options={optionsPersonnes} />
          {f.personne_id === PERSONNE_NOUVELLE && (
            <>
              <Field label="Nom / Raison sociale *" value={f.nom_nouveau}
                onChange={e => setF(p => ({ ...p, nom_nouveau: e.target.value }))}
                placeholder="ex: Anthony Bouskila ou SCI Hoche" />
              <Sel label="Type *" value={f.type_nouveau}
                onChange={e => setF(p => ({ ...p, type_nouveau: e.target.value }))}
                options={[
                  { v: 'physique', l: 'Personne physique' },
                  { v: 'morale', l: 'Personne morale' },
                ]} />
              <p className="text-xs text-gray-400 mb-3">
                Vous pourrez compléter ses coordonnées ensuite via le bouton « Fiche ».
              </p>
            </>
          )}
          <Field label="Participation au capital (%) *" type="number" step="0.01" min="0" max="100"
            value={f.pourcentage}
            onChange={e => setF(p => ({ ...p, pourcentage: e.target.value }))} />
          <Field label="Notes" value={f.notes}
            onChange={e => setF(p => ({ ...p, notes: e.target.value }))}
            placeholder="ex: usufruit, nu-propriété, gérant..." />
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <Btn variant="ghost" onClick={() => setOpen(false)}>Annuler</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Btn>
          </div>
        </Modal>
      )}

      {/* Modale fiche personne */}
      {ficheOpen && (
        <Modal title={`Fiche — ${fichePersonne?.nom || ''}`} onClose={() => setFicheOpen(false)} width="max-w-2xl">
          <p className="text-xs text-gray-400 mb-4">
            Ces informations sont partagées entre toutes vos sociétés et serviront à
            l'envoi de courriers et de rapports.
          </p>

          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Identité</h4>
          <Grid2>
            <Field label="Nom / Raison sociale *" value={fiche.nom}
              onChange={e => setFiche(p => ({ ...p, nom: e.target.value }))} />
            <Sel label="Type" value={fiche.type}
              onChange={e => setFiche(p => ({ ...p, type: e.target.value }))}
              options={[
                { v: 'physique', l: 'Personne physique' },
                { v: 'morale', l: 'Personne morale' },
              ]} />
          </Grid2>
          {fiche.type === 'morale' ? (
            <Field label="SIRET" value={fiche.siret}
              onChange={e => setFiche(p => ({ ...p, siret: e.target.value }))} />
          ) : (
            <Grid2>
              <Field label="Date de naissance" type="date" value={fiche.date_naissance}
                onChange={e => setFiche(p => ({ ...p, date_naissance: e.target.value }))} />
              <Field label="Lieu de naissance" value={fiche.lieu_naissance}
                onChange={e => setFiche(p => ({ ...p, lieu_naissance: e.target.value }))} />
            </Grid2>
          )}
          {fiche.type === 'physique' && (
            <Field label="Nationalité" value={fiche.nationalite}
              onChange={e => setFiche(p => ({ ...p, nationalite: e.target.value }))} />
          )}

          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 mt-4">Contact</h4>
          <Grid2>
            <Field label="Email" type="email" value={fiche.email}
              onChange={e => setFiche(p => ({ ...p, email: e.target.value }))}
              placeholder="prenom.nom@exemple.fr" />
            <Field label="Téléphone" value={fiche.telephone}
              onChange={e => setFiche(p => ({ ...p, telephone: e.target.value }))} />
          </Grid2>
          <Field label="Adresse" value={fiche.adresse}
            onChange={e => setFiche(p => ({ ...p, adresse: e.target.value }))} />
          <Grid2>
            <Field label="Code postal" value={fiche.code_postal}
              onChange={e => setFiche(p => ({ ...p, code_postal: e.target.value }))} />
            <Field label="Ville" value={fiche.ville}
              onChange={e => setFiche(p => ({ ...p, ville: e.target.value }))} />
          </Grid2>
          <Field label="Pays" value={fiche.pays}
            onChange={e => setFiche(p => ({ ...p, pays: e.target.value }))} />
          <Field label="Notes" value={fiche.notes}
            onChange={e => setFiche(p => ({ ...p, notes: e.target.value }))} />

          {ficheError && <p className="text-red-500 text-sm mb-3">{ficheError}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <Btn variant="ghost" onClick={() => setFicheOpen(false)}>Annuler</Btn>
            <Btn onClick={saveFiche} disabled={ficheSaving}>
              {ficheSaving ? 'Enregistrement...' : 'Enregistrer la fiche'}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Membres tab ─────────────────────────────────────────
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

function MembresTab() {
  const { user } = useAuth()
  const { selected, membres, isAdmin, reload } = useSociete()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [invitations, setInvitations] = useState([])

  // Load pending invitations
  useEffect(() => {
    if (selected) {
      supabase.from('invitations').select('*').eq('societe_id', selected.id).then(({ data }) => setInvitations(data || []))
    }
  }, [selected, membres])

  const invite = async () => {
    setError('')
    setSuccess('')
    setLoading(true)
    const trimmedEmail = email.trim().toLowerCase()

    // Everything handled server-side (no profiles query = no permission error)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${FUNCTIONS_URL_TOP}/send-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        email: trimmedEmail,
        societe_id: selected.id,
        societe_name: selected.nom_affiche || selected.nom,
        invited_by_name: user.user_metadata?.full_name || user.email,
        invited_by_id: user.id,
        role,
      }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Erreur'); setLoading(false); return }

    if (result.action === 'added_directly') {
      setSuccess(`${trimmedEmail} ajouté comme membre.`)
      reload()
    } else if (result.action === 'already_member') {
      setError('Déjà membre de cette société.')
    } else {
      setSuccess(`Invitation envoyée à ${trimmedEmail}`)
      const { data: inv } = await supabase.from('invitations').select('*').eq('societe_id', selected.id)
      setInvitations(inv || [])
    }
    setLoading(false)
  }

  const cancelInvite = async (id) => {
    await supabase.from('invitations').delete().eq('id', id)
    setInvitations(prev => prev.filter(i => i.id !== id))
  }

  const changeRole = async (id, newRole) => {
    await supabase.from('societe_membres').update({ role: newRole }).eq('id', id)
    reload()
  }

  const remove = async (id) => {
    if (!confirm('Retirer ce membre ?')) return
    await supabase.from('societe_membres').delete().eq('id', id)
    reload()
  }

  return (
    <div>
      {isAdmin && (
        <div className="flex justify-end mb-4">
          <Btn onClick={() => setOpen(true)}><UserPlus size={15} /> Inviter</Btn>
        </div>
      )}

      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-navy flex items-center justify-center">
              <Shield size={16} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-navy text-sm">Propriétaire</p>
              <p className="text-xs text-gray-400">{selected?.owner_id === user?.id ? 'Vous' : selected?.owner_id}</p>
            </div>
          </div>
          <Badge value="owner" />
        </div>
      </Card>

      {/* Active members */}
      {membres.length > 0 && (
        <div className="space-y-2 mb-4">
          {membres.map(m => (
            <Card key={m.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {m.profiles?.avatar_url ? (
                    <img src={m.profiles.avatar_url} className="w-9 h-9 rounded-full" alt="" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold">
                      {(m.profiles?.full_name || m.profiles?.email || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-navy text-sm">{m.profiles?.full_name || m.profiles?.email}</p>
                    <p className="text-xs text-gray-400">{m.profiles?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isAdmin ? (
                    <select value={m.role} onChange={e => changeRole(m.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 cursor-pointer">
                      <option value="admin">Admin</option>
                      <option value="editor">Éditeur</option>
                      <option value="viewer">Lecteur</option>
                    </select>
                  ) : (
                    <Badge value={m.role} />
                  )}
                  {isAdmin && (
                    <button onClick={() => remove(m.id)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 mt-6">Invitations en attente</p>
          <div className="space-y-2 mb-4">
            {invitations.map(inv => (
              <Card key={inv.id} className="p-4 border-dashed border-amber-200 bg-amber-50/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-bold">
                      {inv.email[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-navy text-sm">{inv.email}</p>
                      <p className="text-xs text-amber-600">Invitation envoyée</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold capitalize">{inv.role}</span>
                    {isAdmin && (
                      <button onClick={() => cancelInvite(inv.id)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {membres.length === 0 && invitations.length === 0 && (
        <Empty icon={<UserPlus size={40} />} text="Aucun membre invité." />
      )}

      {open && (
        <Modal title="Inviter un membre" onClose={() => { setOpen(false); setError(''); setSuccess('') }}>
          <Field label="Email *" type="email" placeholder="nom@exemple.com" value={email} onChange={e => setEmail(e.target.value)} />
          <Sel label="Rôle" value={role} onChange={e => setRole(e.target.value)}
            options={[
              { v: 'viewer', l: 'Lecteur — consultation uniquement' },
              { v: 'editor', l: 'Éditeur — peut modifier les données' },
              { v: 'admin', l: 'Admin — peut gérer les membres' },
            ]} />
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          {success && <p className="text-emerald-600 text-sm mb-3 font-medium">{success}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <Btn variant="ghost" onClick={() => { setOpen(false); setError(''); setSuccess('') }}>Fermer</Btn>
            <Btn onClick={invite} disabled={loading || !email.trim()}>{loading ? 'Envoi...' : 'Inviter'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Banque tab ──────────────────────────────────────────
// Flux Enable Banking : l'utilisateur choisit sa banque, l'Edge Function
// banking-connect ouvre un consentement et renvoie l'URL de la banque, sur
// laquelle on redirige. Au retour, banking-callback persiste session et
// comptes puis renvoie vers /app/banques?connected=1.
//
// La liste des banques vient de l'API : Enable Banking exige le nom exact,
// accents compris, et il y a plus de cent établissements en France — dont une
// quinzaine de Caisses d'Épargne régionales. Une liste écrite à la main serait
// fausse ou incomplète.
function ChoixBanque({ banques, valeur, onChange, chargement, erreur }) {
  const [filtre, setFiltre] = useState('')

  const visibles = useMemo(() => {
    const f = filtre.trim().toLowerCase()
    return f ? banques.filter(b => b.name.toLowerCase().includes(f)) : banques
  }, [banques, filtre])

  // Après filtrage la banque retenue peut avoir disparu de la liste : le select
  // afficherait alors le premier libellé tout en gardant l'ancienne valeur.
  useEffect(() => {
    if (visibles.length && !visibles.some(b => b.name === valeur)) onChange(visibles[0].name)
  }, [visibles, valeur, onChange])

  if (chargement) return <p className="text-xs text-gray-400 mb-3">Chargement de la liste des banques...</p>
  if (erreur) return <p className="text-xs text-red-500 mb-3">{erreur}</p>

  return (
    <>
      <Field label="Rechercher" value={filtre} onChange={e => setFiltre(e.target.value)}
        placeholder="Générale, Épargne Ile De France..." />
      {visibles.length === 0 ? (
        <p className="text-xs text-gray-400 mb-3">Aucune banque ne correspond à cette recherche.</p>
      ) : (
        <Sel label="Banque" value={valeur} onChange={e => onChange(e.target.value)}
          options={visibles.map(b => ({ v: b.name, l: b.name }))} />
      )}
    </>
  )
}

//
// Une connexion rapporte tous les comptes accessibles avec l'identifiant
// utilisé, souvent répartis sur plusieurs sociétés du groupe : le rattachement
// deviné à la connexion doit rester corrigeable.
function LigneCompte({ compte, societes, modifiable, onDeplace }) {
  const [enCours, setEnCours] = useState(false)

  const deplacer = async (societeId) => {
    if (societeId === compte.societe_id) return
    setEnCours(true)
    try {
      const { error } = await supabase.rpc('affecter_compte_bancaire', {
        p_account_uid: compte.account_uid,
        p_societe_id: societeId,
      })
      if (error) throw new Error(error.message)
      await onDeplace()
    } catch (e) {
      onDeplace(e.message)
    }
    setEnCours(false)
  }

  return (
    <div className="bg-gray-50 rounded-lg px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy truncate">{compte.name || 'Compte'}</p>
          <p className="text-xs text-gray-400 font-mono">{compte.iban || '—'}</p>
        </div>
        <p className="text-sm font-semibold text-navy whitespace-nowrap">
          {compte.solde != null ? `${Number(compte.solde).toFixed(2)} ${compte.currency || 'EUR'}` : '—'}
        </p>
      </div>
      {modifiable && societes.length > 1 && (
        <div className="mt-2 pt-2 border-t border-gray-200/70 flex items-center gap-2">
          <span className="text-xs text-gray-400 shrink-0">Rattaché à</span>
          <select
            value={compte.societe_id || ''}
            disabled={enCours}
            onChange={e => deplacer(e.target.value)}
            className="text-xs text-gray-700 bg-white border border-gray-200 rounded px-2 py-1 cursor-pointer"
          >
            {societes.map(s => (
              <option key={s.id} value={s.id}>{s.nom_affiche || s.nom}</option>
            ))}
          </select>
          {enCours && <span className="text-xs text-gray-400">Déplacement...</span>}
        </div>
      )}
    </div>
  )
}

function BanqueTab() {
  const { selected, isAdmin, bankAccounts, bankConnection, reload, societes } = useSociete()
  const [banques, setBanques] = useState([])
  const [chargementBanques, setChargementBanques] = useState(true)
  const [erreurBanques, setErreurBanques] = useState('')
  const [aspsp, setAspsp] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Retour de banking-callback : ?connected=1 ou ?error=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected')) {
      reload()
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('error')) {
      setError(`La banque a refusé la connexion : ${params.get('error')}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [reload])

  const token = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  // La liste est servie par banking-connect, qui la tient de l'API.
  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch(`${FUNCTIONS_URL_TOP}/banking-connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await token()}` },
          body: JSON.stringify({ action: 'aspsps' }),
        })
        const data = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(data.error || 'Liste des banques indisponible')
        setBanques(data.aspsps || [])
      } catch (e) {
        if (!annule) setErreurBanques(e.message)
      } finally {
        if (!annule) setChargementBanques(false)
      }
    })()
    return () => { annule = true }
  }, [])

  const connecter = async () => {
    setError('')
    setConnecting(true)
    try {
      const res = await fetch(`${FUNCTIONS_URL_TOP}/banking-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await token()}` },
        body: JSON.stringify({ aspsp_name: aspsp, societe_id: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Connexion impossible')
      if (!data.url) throw new Error('La banque n’a pas renvoyé d’URL d’autorisation')
      // La suite du parcours se déroule chez la banque.
      window.location.href = data.url
    } catch (e) {
      setError(e.message)
      setConnecting(false)
    }
  }

  // Le compte quitte la société affichée : il disparaît de la liste, ce qu'il
  // faut annoncer pour que ça ne passe pas pour une perte de données.
  const apresDeplacement = async (messageErreur) => {
    if (messageErreur) { setError(messageErreur); return }
    setError('')
    setMessage('Compte déplacé. Il apparaît désormais sous la société de destination.')
    await reload()
  }

  const synchroniser = async () => {
    setSyncing(true)
    setSyncResult(null)
    setError('')
    try {
      const res = await fetch(`${FUNCTIONS_URL_TOP}/banking-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await token()}` },
        body: JSON.stringify({ societe_id: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Synchronisation en échec')
      setSyncResult(data)
      reload()
    } catch (e) { setError(e.message) }
    setSyncing(false)
  }

  const expiree = bankConnection?.status === 'expired'
  const connecte = bankAccounts.length > 0

  return (
    <div>
      {error && (
        <Card className="p-4 mb-4 border-red-200 bg-red-50/40">
          <p className="text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle size={15} /> {error}
          </p>
        </Card>
      )}

      {connecte ? (
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-bold text-navy flex items-center gap-2">
                <Landmark size={16} />
                {bankAccounts.length} compte{bankAccounts.length > 1 ? 's' : ''} connecté{bankAccounts.length > 1 ? 's' : ''}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                {bankConnection?.last_sync
                  ? `Dernière synchronisation le ${fmtDate(bankConnection.last_sync)}`
                  : 'Jamais synchronisé'}
              </p>
            </div>
            {isAdmin && (
              <Btn onClick={synchroniser} disabled={syncing}>
                <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Synchronisation...' : 'Synchroniser'}
              </Btn>
            )}
          </div>

          {expiree && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2.5 mb-4">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Le consentement bancaire a expiré — la DSP2 le limite à 90 jours.
                Reconnectez le compte pour reprendre la synchronisation.
              </span>
            </div>
          )}

          <div className="space-y-2">
            {bankAccounts.map(c => (
              <LigneCompte key={c.id} compte={c} societes={societes}
                modifiable={isAdmin} onDeplace={apresDeplacement} />
            ))}
          </div>

          {message && <p className="text-sm text-emerald-700 mt-4">{message}</p>}

          {syncResult && (
            <p className="text-sm text-emerald-700 mt-4">
              {syncResult.mouvements} mouvement{syncResult.mouvements > 1 ? 's' : ''} récupéré{syncResult.mouvements > 1 ? 's' : ''}, {syncResult.rapproches} rapprochement{syncResult.rapproches > 1 ? 's' : ''} automatique{syncResult.rapproches > 1 ? 's' : ''}.
            </p>
          )}

          {isAdmin && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-2">
                Pour ajouter une autre banque, relancez une connexion.
              </p>
              <ChoixBanque banques={banques} valeur={aspsp} onChange={setAspsp}
                chargement={chargementBanques} erreur={erreurBanques} />
              <Btn variant="ghost" onClick={connecter} disabled={connecting || !aspsp}>
                {connecting ? 'Redirection...' : 'Connecter une autre banque'}
              </Btn>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-8 text-center">
          <Landmark size={40} className="text-gray-300 mx-auto mb-4" />
          <p className="font-semibold text-navy mb-1">Aucun compte bancaire connecté</p>
          <p className="text-sm text-gray-400 mb-5 max-w-md mx-auto">
            Connectez le compte de {selected?.nom_affiche || selected?.nom} pour rapprocher
            automatiquement les loyers attendus des virements réellement reçus.
          </p>
          <div className="max-w-sm mx-auto text-left">
            <ChoixBanque banques={banques} valeur={aspsp} onChange={setAspsp}
              chargement={chargementBanques} erreur={erreurBanques} />
          </div>
          {isAdmin ? (
            <Btn onClick={connecter} disabled={connecting || !aspsp} className="justify-center">
              <Landmark size={15} />
              {connecting ? 'Redirection...' : 'Connecter ce compte'}
            </Btn>
          ) : (
            <p className="text-xs text-gray-400">Seul un administrateur peut connecter un compte.</p>
          )}
          <p className="text-xs text-gray-300 mt-4 max-w-md mx-auto">
            Accès en lecture seule, via Enable Banking (agrégateur agréé DSP2).
            Le consentement est valable 90 jours et révocable à tout moment
            depuis votre banque.
          </p>
        </Card>
      )}
    </div>
  )
}
