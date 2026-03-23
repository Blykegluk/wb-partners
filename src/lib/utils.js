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

// ── Loyer progressif ────────────────────────────────────────

export const getLoyerPourMois = (bail, mois, annee) => {
  if (!bail.date_debut) return bail.loyer_ht
  const debut = new Date(bail.date_debut)
  const target = new Date(annee, mois, 1)
  const moisEcoules =
    (target.getFullYear() - debut.getFullYear()) * 12 +
    (target.getMonth() - debut.getMonth())
  if (moisEcoules < 12 && bail.loyer_an1) return bail.loyer_an1
  if (moisEcoules < 24 && bail.loyer_an2) return bail.loyer_an2
  return bail.loyer_ht
}

export const getLoyerActuel = (bail) => {
  if (!bail.date_debut) return bail.loyer_ht
  const debut = new Date(bail.date_debut)
  const n = new Date()
  const moisEcoules =
    (n.getFullYear() - debut.getFullYear()) * 12 +
    (n.getMonth() - debut.getMonth())
  if (moisEcoules < 12 && bail.loyer_an1) return bail.loyer_an1
  if (moisEcoules < 24 && bail.loyer_an2) return bail.loyer_an2
  return bail.loyer_ht
}
