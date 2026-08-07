export const fmt = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0)

export const fmtPct = (n) => (n * 100).toFixed(1) + ' %'

export const MONTHS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
]

export const MONTHS_SHORT = [
  'Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'
]

export const today = () => new Date().toISOString().slice(0, 10)

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('fr-FR') : '—'

export const fmtSize = (bytes) => {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' o'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko'
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo'
}

export const DOC_TYPES = [
  { v: 'bail', l: 'Bail & avenant', color: '#8b5cf6' },
  { v: 'avis_echeance', l: "Avis d'échéance", color: '#3b82f6' },
  { v: 'facture', l: 'Facture acquittée', color: '#10b981' },
  { v: 'commandement', l: 'Commandement de payer', color: '#dc2626' },
  { v: 'amortissement', l: "Tableau d'amortissement", color: '#f59e0b' },
  { v: 'autre', l: 'Autre', color: '#64748b' },
]

export const googleMapsUrl = (adresse, ville, cp) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${adresse}, ${cp} ${ville}`)}`

// ── Loyer d'un bail pour un mois donné ──────────────────────
//
// Le loyer HT du bail au 1er du mois demandé : 0 hors de la période du
// bail (avant date_debut, après date_fin), 0 pendant la franchise, palier
// an1/an2/an3 pendant les trois premières années (décalées de la
// franchise), loyer_ht ensuite. C'est LA source du loyer dans toute
// l'application — biens.loyer_mensuel n'entre dans aucun calcul.

export const getLoyerPourMois = (bail, mois, annee) => {
  const target = new Date(annee, mois, 1)
  // Hors période du bail : rien n'est dû.
  if (bail.date_fin && target > new Date(bail.date_fin)) return 0
  if (!bail.date_debut) return Number(bail.loyer_ht || 0)
  const debut = new Date(bail.date_debut)
  if (target < new Date(debut.getFullYear(), debut.getMonth(), 1)) return 0
  const moisEcoules =
    (target.getFullYear() - debut.getFullYear()) * 12 +
    (target.getMonth() - debut.getMonth())
  // Franchise de loyer : 0 € pendant les N premiers mois — puis les paliers
  // annuels courent à partir de la fin de la franchise, pas du bail.
  const franchise = Number(bail.franchise_mois || 0)
  if (moisEcoules < franchise) return 0
  const moisPayants = moisEcoules - franchise
  if (moisPayants < 12 && bail.loyer_an1 != null) return Number(bail.loyer_an1)
  if (moisPayants < 24 && bail.loyer_an2 != null) return Number(bail.loyer_an2)
  if (moisPayants < 36 && bail.loyer_an3 != null) return Number(bail.loyer_an3)
  return Number(bail.loyer_ht || 0)
}

// Charges d'un bail pour un mois donné : mêmes bornes que le loyer, et la
// franchise les couvre aussi — pendant la franchise, ni loyer ni charges ne
// sont dus. Toute addition « loyer + charges » doit passer par ici, sinon un
// bail en franchise paraît devoir ses provisions sur charges.
export const chargesPourMois = (bail, mois, annee) => {
  const target = new Date(annee, mois, 1)
  if (bail.date_fin && target > new Date(bail.date_fin)) return 0
  if (!bail.date_debut) return Number(bail.charges || 0)
  const debut = new Date(bail.date_debut)
  if (target < new Date(debut.getFullYear(), debut.getMonth(), 1)) return 0
  const moisEcoules =
    (target.getFullYear() - debut.getFullYear()) * 12 +
    (target.getMonth() - debut.getMonth())
  if (moisEcoules < Number(bail.franchise_mois || 0)) return 0
  return Number(bail.charges || 0)
}

export const getLoyerActuel = (bail) => {
  const n = new Date()
  return getLoyerPourMois(bail, n.getMonth(), n.getFullYear())
}
