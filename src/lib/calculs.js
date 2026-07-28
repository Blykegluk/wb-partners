/**
 * Rendement brut = (loyer mensuel × 12) / prix d'achat
 */
export const rendementBrut = (bien) => {
  if (!bien.prix_achat || !bien.loyer_mensuel) return null
  return (bien.loyer_mensuel * 12) / bien.prix_achat
}

/**
 * Rendement net = ((loyer - charges - annuités - TF/12) × 12) / apport
 */
export const rendementNet = (bien) => {
  const apport = bien.apport || bien.prix_achat
  if (!apport || !bien.loyer_mensuel) return null
  const mensuelNet =
    bien.loyer_mensuel -
    (bien.charges || 0) -
    (bien.annuites || 0) -
    (bien.taxe_fonciere || 0) / 12
  return (mensuelNet * 12) / apport
}

/**
 * Cashflow mensuel = loyer - charges - annuités - TF/12
 *
 * Valeur « 100 % du bien », indépendante de la détention. Les rendements
 * ci-dessus restent eux aussi à 100 % : ce sont des ratios, ils ne changent
 * pas quand on ne détient qu'une fraction du bien.
 */
export const cashflowMensuel = (bien) => {
  return (
    (bien.loyer_mensuel || 0) -
    (bien.charges || 0) -
    (bien.annuites || 0) -
    (bien.taxe_fonciere || 0) / 12
  )
}

// ── Acquisition ──────────────────────────────────────────────

/**
 * Le bien est-il effectivement acquis à la date de référence ?
 *
 * Tant que l'acte n'est pas signé, la société ne perçoit ni ne débourse
 * rien au titre du bien (hors apports des associés) : aucun loyer, aucune
 * charge, aucune annuité ne doit être comptée. Une date d'acquisition
 * future signale précisément cette situation.
 *
 * Un bien sans date renseignée est considéré comme acquis (comportement
 * historique : la donnée est facultative).
 */
export const estAcquis = (bien, ref = new Date()) => {
  if (!bien?.date_acquisition) return true
  // Comparaison à la journée : un bien acquis aujourd'hui compte.
  const d = new Date(bien.date_acquisition)
  if (isNaN(d.getTime())) return true
  const jour = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const acq = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return acq <= jour
}

/**
 * Nombre de jours avant l'acquisition (0 si déjà acquis).
 */
export const joursAvantAcquisition = (bien, ref = new Date()) => {
  if (estAcquis(bien, ref)) return 0
  const d = new Date(bien.date_acquisition)
  return Math.ceil((d - ref) / 86400000)
}

// ── Détention ────────────────────────────────────────────────
//
// Un bien sans ligne dans bien_actionnaires est détenu à 100 % par la
// société. Sinon, la société conserve le solde non attribué aux tiers.

/**
 * Part du bien détenue par la société, en fraction (0 → 1).
 */
export const partSociete = (bienId, bienActionnaires = []) => {
  const lignes = bienActionnaires.filter(x => x.bien_id === bienId)
  if (lignes.length === 0) return 1
  const tiers = lignes.reduce((s, x) => s + Number(x.pourcentage || 0), 0)
  // Borné à [0,1] : une saisie incohérente ne doit pas produire de négatif.
  return Math.max(0, Math.min(1, (100 - tiers) / 100))
}

/**
 * Part du bien détenue en direct par une personne, en fraction (0 → 1).
 * Ne tient pas compte de sa participation au capital de la société.
 */
export const partDirectePersonne = (bienId, personneId, bienActionnaires = []) => {
  return bienActionnaires
    .filter(x => x.bien_id === bienId && x.personne_id === personneId)
    .reduce((s, x) => s + Number(x.pourcentage || 0), 0) / 100
}

/**
 * Agrégats d'un portefeuille de biens, pondérés par la part réellement
 * détenue par la société. Retourne aussi les valeurs brutes (100 %) pour
 * pouvoir afficher les deux.
 */
export const agregatsBiens = (biens = [], bienActionnaires = [], ref = new Date()) => {
  const acc = {
    valeurBrute: 0, valeurNette: 0,
    detteBrute: 0, detteNette: 0,
    loyerMensuelBrut: 0, loyerMensuelNet: 0,
    cashflowBrut: 0, cashflowNet: 0,
    partielle: false,      // au moins un bien n'est pas détenu à 100 %
    // Biens sous compromis, pas encore signés : suivis à part, exclus des
    // agrégats ci-dessus.
    nbEnCours: 0,
    valeurEnCours: 0,
    engagementEnCours: 0,  // emprunt prévu, non encore décaissé
  }
  biens.forEach(b => {
    const part = partSociete(b.id, bienActionnaires)
    if (part < 0.9999) acc.partielle = true
    const prix = b.prix_achat || 0
    const dette = b.montant_emprunt || 0

    if (!estAcquis(b, ref)) {
      acc.nbEnCours += 1
      acc.valeurEnCours += prix * part
      acc.engagementEnCours += dette * part
      return
    }

    const loyer = b.loyer_mensuel || 0
    const cf = cashflowMensuel(b)

    acc.valeurBrute += prix
    acc.detteBrute += dette
    acc.loyerMensuelBrut += loyer
    acc.cashflowBrut += cf

    acc.valeurNette += prix * part
    acc.detteNette += dette * part
    acc.loyerMensuelNet += loyer * part
    acc.cashflowNet += cf * part
  })
  acc.patrimoineNetBrut = acc.valeurBrute - acc.detteBrute
  acc.patrimoineNet = acc.valeurNette - acc.detteNette
  return acc
}

/**
 * Quote-part consolidée d'une personne sur un portefeuille.
 *
 * Deux canaux cumulés :
 *   - indirect : via sa participation au capital de la société, appliquée à
 *     la part que la société détient réellement de chaque bien ;
 *   - direct   : sa détention en propre sur un bien (bien_actionnaires).
 */
export const quotePartPersonne = ({
  personneId,
  pctSociete = 0,
  biens = [],
  bienActionnaires = [],
  ref = new Date(),
}) => {
  const r = {
    valeur: 0, dette: 0, loyerMensuel: 0, cashflow: 0,
    valeurDirecte: 0, valeurIndirecte: 0,
  }
  const fracSoc = Number(pctSociete || 0) / 100

  // Les biens non encore acquis sont exclus : aucune quote-part ne peut en
  // découler tant que l'acte n'est pas signé.
  biens.filter(b => estAcquis(b, ref)).forEach(b => {
    const prix = b.prix_achat || 0
    const dette = b.montant_emprunt || 0
    const loyer = b.loyer_mensuel || 0
    const cf = cashflowMensuel(b)

    const indirect = partSociete(b.id, bienActionnaires) * fracSoc
    const direct = partDirectePersonne(b.id, personneId, bienActionnaires)
    const total = indirect + direct

    r.valeur += prix * total
    r.dette += dette * total
    r.loyerMensuel += loyer * total
    r.cashflow += cf * total
    r.valeurIndirecte += prix * indirect
    r.valeurDirecte += prix * direct
  })

  r.patrimoineNet = r.valeur - r.dette
  return r
}
