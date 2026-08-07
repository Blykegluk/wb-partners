import { getLoyerPourMois, getLoyerActuel, chargesPourMois } from './utils'

// ── Loyer d'un bien ──────────────────────────────────────────
//
// LE loyer vient des baux, jamais de la fiche bien : biens.loyer_mensuel
// était une seconde source de vérité qui divergeait des baux (progressifs,
// franchises, dates de fin ignorées). Toutes les fonctions ci-dessous
// prennent donc les baux en paramètre.

/** Loyer mensuel HT courant d'un bien : somme de ses baux actifs, bornés
 *  par leurs dates (un bail terminé ou pas encore commencé compte 0). */
export const loyerMensuelBien = (bien, baux = []) =>
  baux
    .filter((b) => b.bien_id === bien.id && b.actif)
    .reduce((s, b) => s + getLoyerActuel(b), 0)

/**
 * Rendement brut = (loyer mensuel × 12) / prix d'achat
 */
export const rendementBrut = (bien, baux = []) => {
  const loyer = loyerMensuelBien(bien, baux)
  if (!bien.prix_achat || !loyer) return null
  return (loyer * 12) / bien.prix_achat
}

/**
 * Rendement net = ((loyer - charges - annuités - TF/12) × 12) / apport
 * (à défaut d'apport saisi : sur le prix d'achat — c'est alors un
 * rendement net sur prix, pas un cash-on-cash).
 */
export const rendementNet = (bien, baux = []) => {
  const apport = bien.apport || bien.prix_achat
  const loyer = loyerMensuelBien(bien, baux)
  if (!apport || !loyer) return null
  const mensuelNet =
    loyer -
    (bien.charges || 0) -
    (bien.annuites || 0) -
    (bien.taxe_fonciere || 0) / 12
  return (mensuelNet * 12) / apport
}

/**
 * Cashflow mensuel estimé = loyer - charges - annuités - TF/12
 *
 * Valeur « 100 % du bien », indépendante de la détention. Les rendements
 * ci-dessus restent eux aussi à 100 % : ce sont des ratios, ils ne changent
 * pas quand on ne détient qu'une fraction du bien. C'est une ESTIMATION de
 * fiche (le cashflow constaté vit dans les flux bancaires réels).
 */
export const cashflowMensuel = (bien, baux = []) => {
  return (
    loyerMensuelBien(bien, baux) -
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
export const agregatsBiens = (biens = [], bienActionnaires = [], baux = [], ref = new Date()) => {
  const acc = {
    valeurBrute: 0, valeurNette: 0,
    detteBrute: 0, detteNette: 0,
    loyerMensuelBrut: 0, loyerMensuelNet: 0,
    cashflowBrut: 0, cashflowNet: 0,
    partielle: false,      // au moins un bien n'est pas détenu à 100 %
    detteEstimee: false,   // au moins un prêt sans termes : capital d'origine affiché
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

    if (!estAcquis(b, ref)) {
      acc.nbEnCours += 1
      acc.valeurEnCours += prix * part
      acc.engagementEnCours += (b.montant_emprunt || 0) * part
      return
    }

    // Dette = capital restant dû, pas capital d'origine.
    const pret = encoursPret(b, ref)
    const dette = pret.montant
    if (pret.estime) acc.detteEstimee = true

    const loyer = loyerMensuelBien(b, baux)
    const cf = cashflowMensuel(b, baux)

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
  baux = [],
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
    const dette = encoursPret(b, ref).montant
    const loyer = loyerMensuelBien(b, baux)
    const cf = cashflowMensuel(b, baux)

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

// ── Écart entre l'échéancier et les encaissements ────────────
//
// L'application confondait trois notions :
//
//   attendu   ce que les baux prévoient pour la période
//   déclaré   les échéances marquées payées, à la main ou non
//   encaissé  les virements effectivement reçus et rattachés
//
// Une échéance marquée payée à la main n'est pas un encaissement : c'est une
// intention. L'écart se mesure donc entre l'attendu et l'encaissé, le déclaré
// servant à expliquer la différence.

/**
 * Montant dû par un bail pour un mois donné, nul hors période de bail.
 * Les bornes reprennent exactement celles de la grille de l'échéancier : les
 * deux écrans doivent afficher le même dû, sans quoi l'écart serait faux.
 */
export const attenduMois = (bail, mois, annee) => {
  const premierDuMois = new Date(annee, mois, 1)
  if (bail.date_debut) {
    const d = new Date(bail.date_debut)
    if (premierDuMois < new Date(d.getFullYear(), d.getMonth(), 1)) return 0
  }
  if (bail.date_fin && premierDuMois > new Date(bail.date_fin)) return 0
  // chargesPourMois et non bail.charges : la franchise suspend aussi les
  // provisions sur charges — un bail en franchise ne doit rien du tout.
  return getLoyerPourMois(bail, mois, annee) + chargesPourMois(bail, mois, annee)
}

/**
 * Coefficient de passage HT → TTC d'un bail.
 *
 * L'échéancier est tenu en HT, la banque encaisse du TTC. Toute comparaison
 * entre les deux doit passer par là, faute de quoi un bail assujetti paraît
 * surpayé de 20 %.
 */
export const coefTva = (bail) =>
  bail?.tva_applicable === false ? 1 : 1 + Number(bail?.taux_tva ?? 20) / 100

/** Baux générant effectivement des flux : actifs, sur un bien déjà acquis. */
export const bauxProductifs = (baux = [], biens = []) =>
  baux.filter((b) => {
    if (!b.actif) return false
    const bien = biens.find((x) => x.id === b.bien_id)
    return !bien || estAcquis(bien)
  })

export const ecartsEncaissement = ({
  baux = [], biens = [], transactions = [], bankTransactions = [], annee,
}) => {
  const actifs = bauxProductifs(baux, biens)
  const echeanceParId = new Map(transactions.map((t) => [t.id, t]))
  const bailParId = new Map(baux.map((b) => [b.id, b]))

  // Tout est ramené en TTC : c'est la seule unité dans laquelle l'échéancier
  // et les relevés bancaires sont comparables.
  const duTTC = (ech) => {
    const ht = Number(ech.montant_loyer || 0) + Number(ech.montant_charges || 0)
    return ht * coefTva(bailParId.get(ech.bail_id))
  }

  const rapproches = bankTransactions.filter(
    (t) => t.transaction_id && t.statut_rapprochement?.startsWith('rapproche'),
  )

  const mois = Array.from({ length: 12 }, (_, m) => ({
    mois: m,
    attendu: actifs.reduce((s, b) => s + attenduMois(b, m, annee) * coefTva(b), 0),
    declare: 0,
    encaisse: 0,
  }))

  for (const t of transactions) {
    if (t.annee !== annee || t.statut !== 'payé') continue
    mois[t.mois].declare += duTTC(t)
  }

  for (const mvt of rapproches) {
    const ech = echeanceParId.get(mvt.transaction_id)
    if (!ech || ech.annee !== annee) continue
    mois[ech.mois].encaisse += Number(mvt.amount || 0)
  }

  const total = mois.reduce((a, m) => ({
    attendu: a.attendu + m.attendu,
    declare: a.declare + m.declare,
    encaisse: a.encaisse + m.encaisse,
  }), { attendu: 0, declare: 0, encaisse: 0 })

  const idsRapprochees = new Set(rapproches.map((m) => m.transaction_id))

  // Encaissement supposé : l'échéance est soldée sans qu'aucun virement ne
  // l'atteste. Légitime pour un paiement en espèces ou une compensation, à
  // vérifier dans tous les autres cas.
  const declareSansVirement = transactions
    .filter((t) => t.annee === annee && t.statut === 'payé' && !idsRapprochees.has(t.id))
    .map((t) => ({ ...t, duTTC: duTTC(t) }))

  const impayees = transactions
    .filter((t) => t.annee === annee && t.statut === 'impayé')
    .map((t) => ({ ...t, duTTC: duTTC(t) }))

  // Le moteur de rapprochement tolère un écart de montant : un virement
  // partiel ou un trop-perçu passe donc pour rapproché. Il faut le montrer.
  const ecartsMontant = rapproches.reduce((acc, mvt) => {
    const ech = echeanceParId.get(mvt.transaction_id)
    if (!ech || ech.annee !== annee) return acc
    const du = duTTC(ech)
    const recu = Number(mvt.amount || 0)
    // Un centime d'arrondi n'est pas un écart.
    if (Math.abs(recu - du) < 0.02) return acc
    return [...acc, {
      mouvement: mvt, echeance: ech, du, recu,
      delta: recu - du,
      motif: mvt.motif_ecart || null,
    }]
  }, [])

  // Argent reçu que rien n'explique.
  const creditsNonRattaches = bankTransactions.filter(
    (t) => Number(t.amount) > 0
      && t.statut_rapprochement === 'a_qualifier'
      && t.booking_date && new Date(t.booking_date).getFullYear() === annee,
  )

  return {
    mois,
    total,
    ecart: total.encaisse - total.attendu,
    declareSansVirement,
    impayees,
    ecartsMontant,
    creditsNonRattaches,
  }
}

/**
 * Suivi des loyers : la vie de chaque échéance sur une ligne.
 *
 * Pour chaque bail productif et chaque mois de l'année : l'attendu TTC, ce
 * qui est réellement entré en banque, la façon dont on le sait (rapproché
 * automatiquement, à la main, ou simplement déclaré), l'écart, et le dernier
 * courrier parti. C'est la vue qui réunit ce que l'Échéancier, les Écarts et
 * les Relances montraient chacun de leur côté.
 */
export const suiviLoyers = ({
  baux = [], biens = [], transactions = [], bankTransactions = [], courriers = [], annee,
}) => {
  const actifs = bauxProductifs(baux, biens)
  const now = new Date()

  const rapprochesParEcheance = new Map()
  for (const mvt of bankTransactions) {
    if (!mvt.transaction_id || !mvt.statut_rapprochement?.startsWith('rapproche')) continue
    const liste = rapprochesParEcheance.get(mvt.transaction_id) || []
    liste.push(mvt)
    rapprochesParEcheance.set(mvt.transaction_id, liste)
  }

  // Dernier courrier par échéance et par période de bail (les avis
  // d'échéance ne référencent pas d'échéance, seulement bail + période).
  const courrierPour = (bailId, echId, mois) => {
    return courriers.find(c =>
      c.statut === 'envoye'
      && ((echId && c.transaction_id === echId)
        || (c.bail_id === bailId && c.mois === mois && c.annee === annee))
    ) || null
  }

  const parBail = actifs.map(bail => {
    const coef = coefTva(bail)
    const lignes = []

    for (let mois = 0; mois < 12; mois++) {
      const attendu = attenduMois(bail, mois, annee) * coef
      const ech = transactions.find(t => t.bail_id === bail.id && t.mois === mois && t.annee === annee) || null
      const mouvements = ech ? (rapprochesParEcheance.get(ech.id) || []) : []
      const recu = mouvements.reduce((s, m) => s + Number(m.amount || 0), 0)
      const futur = new Date(annee, mois, 1) > new Date(now.getFullYear(), now.getMonth(), 1)

      // Comment sait-on que c'est payé ?
      let qualification = 'aucun'
      if (mouvements.length > 0) {
        qualification = mouvements.some(m => m.statut_rapprochement === 'rapproche_auto')
          ? 'rapproche_auto' : 'rapproche_manuel'
      } else if (ech?.statut === 'payé') {
        qualification = 'declare'
      }

      const ecart = recu - attendu
      let verdict
      if (attendu === 0) verdict = 'horsBail'
      else if (futur) verdict = 'futur'
      // Déclaré payé à la main sans virement en face : pas un impayé — on ne
      // relance pas un locataire qui a payé. C'est un « à rattacher ».
      else if (recu === 0 && ech?.statut === 'payé') verdict = 'declare'
      else if (recu === 0) verdict = 'flag'
      else if (Math.abs(ecart) < 0.02) verdict = 'ok'
      else if (ecart < 0) verdict = 'watch'
      else verdict = 'ok'

      lignes.push({
        mois, attendu, ech, mouvements, recu, ecart, futur, qualification, verdict,
        motifEcart: mouvements.find(m => m.motif_ecart)?.motif_ecart || null,
        courrier: attendu > 0 ? courrierPour(bail.id, ech?.id, mois) : null,
      })
    }

    const duesADate = lignes.filter(l => l.attendu > 0 && !l.futur)
    return {
      bail,
      lignes,
      totaux: {
        attendu: lignes.reduce((s, l) => s + l.attendu, 0),
        // Attendu et écart à date ne comptent que le passé : un loyer de
        // décembre non encore dû n'est ni un manque ni un dénominateur.
        attenduADate: duesADate.reduce((s, l) => s + l.attendu, 0),
        recu: lignes.reduce((s, l) => s + l.recu, 0),
        ecart: duesADate.reduce((s, l) => s + l.ecart, 0),
        moisSansVirement: duesADate.filter(l => l.recu === 0).length,
      },
    }
  })

  const total = parBail.reduce((a, b) => ({
    attendu: a.attendu + b.totaux.attendu,
    attenduADate: a.attenduADate + b.totaux.attenduADate,
    recu: a.recu + b.totaux.recu,
    ecart: a.ecart + b.totaux.ecart,
    moisSansVirement: a.moisSansVirement + b.totaux.moisSansVirement,
  }), { attendu: 0, attenduADate: 0, recu: 0, ecart: 0, moisSansVirement: 0 })

  // Argent entré sans échéance en face ET sans nature connue : crédits ni
  // rattachés à une échéance, ni qualifiés dans Banque. Un crédit qualifié
  // (dépôt de garantie reçu, apport en compte courant…) a déjà sa réponse —
  // le compter « à affecter » ferait croire que la qualification s'est perdue.
  const horsEcheance = bankTransactions.filter(t =>
    Number(t.amount) > 0
    && !t.transaction_id
    && !t.categorie
    && t.booking_date && new Date(t.booking_date).getFullYear() === annee,
  )

  // Crédits qualifiés hors loyers (dépôts de garantie, apports, indemnités…) :
  // leur nature est connue, ils ne sont pas « à affecter » — mais ils doivent
  // rester visibles ici sans obliger à fouiller la liste bancaire.
  const encaissementsQualifies = bankTransactions.filter(t =>
    Number(t.amount) > 0
    && !t.transaction_id
    && t.categorie
    && t.booking_date && new Date(t.booking_date).getFullYear() === annee,
  )

  const courriersAnnee = courriers.filter(c => c.annee === annee || (!c.annee && new Date(c.envoye_le).getFullYear() === annee))

  return { parBail, total, horsEcheance, encaissementsQualifies, courriersAnnee }
}

// ── Trésorerie et flux réels (banque) ───────────────────────────
//
// Les écrans financiers reposaient sur des projections : loyers déclarés
// « payé » en HT face à des sorties forfaitaires tirées des fiches biens.
// Depuis la connexion bancaire, la vérité est disponible : le solde réel de
// chaque compte, rafraîchi à chaque synchronisation, et tous les mouvements.
// La limite est la fenêtre d'historique consentie par la banque (90 jours à
// 6 mois avant la connexion) : avant `debut`, il n'existe pas de vérité
// bancaire, et les courbes doivent s'interrompre plutôt qu'inventer.

// 'XXX' est le code ISO 4217 « devise non renseignée » : certaines banques
// le déclarent au niveau du compte alors que les mouvements sont en EUR.
// L'écarter ferait passer un compte français pour une devise étrangère.
export const comptesSuivisEur = (bankAccounts = []) =>
  bankAccounts.filter((c) => c.suivi !== false && ['EUR', 'XXX'].includes(c.currency || 'EUR'))

/** Premier jour du mois suivant, en ISO local (pas de décalage UTC). */
const debutMoisSuivant = (annee, mois) => {
  const d = new Date(annee, mois + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Trésorerie réelle : solde actuel des comptes suivis (EUR) et solde
 * reconstruit à rebours à n'importe quelle fin de mois — exact sur toute la
 * fenêtre couverte, puisque solde(fin M) = solde actuel − mouvements
 * postérieurs à M. Renvoie null si aucun compte n'est connecté.
 */
export const tresorerieReelle = ({ bankAccounts = [], bankTransactions = [] }) => {
  const comptes = comptesSuivisEur(bankAccounts)
  if (comptes.length === 0) return null
  const uids = new Set(comptes.map((c) => c.account_uid))
  const soldeActuel = comptes.reduce((s, c) => s + Number(c.solde || 0), 0)
  const mvts = bankTransactions.filter((t) => uids.has(t.account_uid) && t.booking_date)
  const debut = mvts.reduce((min, t) => (min === null || t.booking_date < min ? t.booking_date : min), null)

  // Solde au matin d'une date : le solde actuel moins tout ce qui a bougé
  // depuis. La trésorerie est un instantané, pas une moyenne — chaque point
  // rendu doit porter sa date exacte.
  const soldeALaDate = (dateIso) => {
    const posterieurs = mvts
      .filter((t) => t.booking_date >= dateIso)
      .reduce((s, t) => s + Number(t.amount || 0), 0)
    return soldeActuel - posterieurs
  }

  const soldeFinMois = (annee, mois) => soldeALaDate(debutMoisSuivant(annee, mois))

  return { soldeActuel, debut, mvts, soldeALaDate, soldeFinMois }
}

/** Postes de sorties pour la ventilation des flux réels. Toute catégorie du
 *  catalogue doit être mappée : « autres » est réservé aux mouvements non
 *  encore qualifiés dans Banque. */
export const POSTES_SORTIES = [
  { k: 'prets', l: 'Échéances de prêt', cats: ['echeance_pret'] },
  { k: 'impots', l: 'Impôts et taxes', cats: ['taxe_fonciere', 'taxe_bureaux', 'impots_taxes'] },
  { k: 'travaux', l: 'Travaux', cats: ['travaux'] },
  { k: 'copro', l: 'Charges de copropriété', cats: ['charges_copropriete'] },
  { k: 'exploitation', l: 'Assurance, honoraires, frais', cats: ['assurance', 'honoraires', 'frais_bancaires', 'charges_diverses', 'autre_depense'] },
  { k: 'capital', l: 'Capital & associés', cats: ['restitution_depot', 'remboursement_cca', 'dividendes'] },
  { k: 'autres', l: 'À qualifier', cats: null },
]

/**
 * Flux réels d'une année, mois par mois : loyers encaissés (crédits
 * rapprochés d'une échéance), autres recettes, sorties ventilées par poste,
 * et solde bancaire réel en fin de mois (null hors de la fenêtre couverte).
 */
export const fluxReelsParMois = ({ bankAccounts = [], bankTransactions = [], annee }) => {
  const reel = tresorerieReelle({ bankAccounts, bankTransactions })
  if (!reel) return null
  const { mvts, debut, soldeActuel, soldeALaDate, soldeFinMois } = reel
  const now = new Date()
  const posteDe = (categorie) =>
    POSTES_SORTIES.find((p) => p.cats?.includes(categorie))?.k || 'autres'

  const mois = Array.from({ length: 12 }, (_, m) => {
    const duMois = mvts.filter((t) => {
      const d = new Date(t.booking_date)
      return d.getFullYear() === annee && d.getMonth() === m
    })
    const credits = duMois.filter((t) => Number(t.amount) > 0)
    const debits = duMois.filter((t) => Number(t.amount) < 0)

    const loyers = credits
      .filter((t) => t.transaction_id && t.statut_rapprochement?.startsWith('rapproche'))
      .reduce((s, t) => s + Number(t.amount), 0)
    // Les dépôts de garantie sont de la trésorerie mais pas un produit : ils
    // sortent des « autres recettes » pour être montrés à part, sans jamais
    // entrer dans une rentabilité.
    const depots = credits
      .filter((t) => t.categorie === 'depot_garantie_recu')
      .reduce((s, t) => s + Number(t.amount), 0)
    const autresRecettes = credits
      .filter((t) => !(t.transaction_id && t.statut_rapprochement?.startsWith('rapproche'))
        && t.categorie !== 'depot_garantie_recu')
      .reduce((s, t) => s + Number(t.amount), 0)

    const sorties = Object.fromEntries(POSTES_SORTIES.map((p) => [p.k, 0]))
    let aQualifier = 0
    for (const t of debits) {
      sorties[posteDe(t.categorie)] += -Number(t.amount)
      if (t.statut_rapprochement === 'a_qualifier') aQualifier += -Number(t.amount)
    }

    // Un mois entièrement antérieur à la fenêtre bancaire, ou pas encore
    // entamé, n'a pas de solde réel à montrer.
    const horsFenetre = debut ? debutMoisSuivant(annee, m) <= debut : true
    const futur = new Date(annee, m, 1) > now
    return {
      mois: m,
      entrees: loyers + depots + autresRecettes,
      loyers,
      depots,
      autresRecettes,
      sorties,
      aQualifier,
      totalSorties: Object.values(sorties).reduce((s, v) => s + v, 0),
      solde: horsFenetre || futur ? null : soldeFinMois(annee, m),
    }
  })

  // Dépôts de garantie détenus : reçus moins restitués, sur toute la fenêtre
  // bancaire (pas seulement l'année affichée). C'est de l'argent en caisse
  // qui n'appartient pas à la société — à connaître avant de le dépenser.
  // Un dépôt encaissé avant le début de l'historique bancaire échappe au
  // calcul : la fenêtre est la seule vérité disponible.
  const depotsDetenus = mvts.reduce((s, t) => {
    if (t.categorie === 'depot_garantie_recu') return s + Number(t.amount || 0)
    if (t.categorie === 'restitution_depot') return s + Number(t.amount || 0)
    return s
  }, 0)

  return { mois, debut, soldeActuel, soldeALaDate, depotsDetenus }
}

/**
 * Balance TVA sur flux réels. Collectée : virement par virement rapproché
 * d'une échéance, au taux et à l'assujettissement du bail — c'est de la TVA
 * sur les encaissements, son fait générateur pour les loyers. Déductible :
 * estimée par nature des débits (travaux et honoraires à 20 % dans le TTC) ;
 * assurance et frais bancaires exonérés, taxes et annuités hors champ, TVA
 * de copropriété non estimable depuis un flux bancaire.
 */
export const tvaReelle = ({ bankAccounts = [], bankTransactions = [], transactions = [], baux = [], annee }) => {
  const reel = tresorerieReelle({ bankAccounts, bankTransactions })
  if (!reel) return null
  const echParId = new Map(transactions.map((t) => [t.id, t]))
  const bailParId = new Map(baux.map((b) => [b.id, b]))
  const CATS_DEDUCTIBLES = ['travaux', 'honoraires']

  const rapproches = new Set()
  const mois = Array.from({ length: 12 }, (_, m) => {
    const duMois = reel.mvts.filter((t) => {
      const d = new Date(t.booking_date)
      return d.getFullYear() === annee && d.getMonth() === m
    })

    let encaisseTTC = 0
    let collectee = 0
    let ecartRapprochement = 0
    for (const t of duMois) {
      if (!(Number(t.amount) > 0 && t.transaction_id && t.statut_rapprochement?.startsWith('rapproche'))) continue
      rapproches.add(t.transaction_id)
      const ech = echParId.get(t.transaction_id)
      const coef = coefTva(bailParId.get(ech?.bail_id))
      encaisseTTC += Number(t.amount)
      collectee += Number(t.amount) * (coef - 1) / coef
      // Un virement peut dépasser (ou manquer) le dû de son échéance : la
      // TVA calculée suit le montant réellement encaissé, mais l'écart doit
      // rester visible — il porte peut-être une autre nature de produit.
      if (ech) {
        const duTTC = (Number(ech.montant_loyer || 0) + Number(ech.montant_charges || 0)) * coef
        ecartRapprochement += Number(t.amount) - duTTC
      }
    }

    let deductible = 0
    let baseDeductible = 0
    for (const t of duMois) {
      if (Number(t.amount) < 0 && CATS_DEDUCTIBLES.includes(t.categorie)) {
        baseDeductible += -Number(t.amount)
        deductible += -Number(t.amount) * 0.2 / 1.2
      }
    }

    return { mois: m, encaisseTTC, collectee, deductible, baseDeductible, ecartRapprochement, solde: collectee - deductible }
  })

  // Vigilance : les échéances déclarées payées sans virement rapproché ne
  // portent aucune TVA réelle — leur TVA théorique est donnée à titre indicatif.
  const declaresNonRapproches = transactions.filter(
    (t) => t.annee === annee && t.statut === 'payé' && !rapproches.has(t.id),
  )
  const tvaDeclareeNonComptee = declaresNonRapproches.reduce((s, t) => {
    const coef = coefTva(bailParId.get(t.bail_id))
    return s + (Number(t.montant_loyer || 0) + Number(t.montant_charges || 0)) * (coef - 1)
  }, 0)

  return {
    mois,
    debut: reel.debut,
    declaresNonRapproches: declaresNonRapproches.length,
    tvaDeclareeNonComptee,
    ecartsRapprochement: mois.reduce((s, m) => s + m.ecartRapprochement, 0),
  }
}

// ── Emprunts : encours réel et intérêts ─────────────────────────
//
// « Dette » affichait le capital emprunté d'origine, jamais amorti : le
// patrimoine net était sous-évalué de tout le capital déjà remboursé. Le
// tableau d'amortissement se calcule depuis les termes du prêt de la fiche
// bien (montant, taux, durée, différé) — sans taux renseigné, on retombe
// sur le capital initial en le disant (estime: true).

/** Nombre de mensualités déjà versées à la date de référence. */
const mensualitesVersees = (bien, ref = new Date()) => {
  if (!bien.date_acquisition) return 0
  const debut = new Date(bien.date_acquisition)
  // Le différé (decalage_pret, en mois) repousse la première mensualité.
  debut.setMonth(debut.getMonth() + Number(bien.decalage_pret || 0))
  const n = (ref.getFullYear() - debut.getFullYear()) * 12 + (ref.getMonth() - debut.getMonth())
  return Math.max(0, Math.min(n, Number(bien.duree_credit || 0)))
}

/**
 * Capital restant dû du prêt d'un bien à une date. Renvoie
 * { montant, estime } — estime=true quand les termes manquent (taux ou
 * durée absents) et que le chiffre est le capital d'origine, pas un encours.
 */
export const encoursPret = (bien, ref = new Date()) => {
  const K = Number(bien.montant_emprunt || 0)
  if (K <= 0) return { montant: 0, estime: false }
  const taux = Number(bien.taux_interet)
  const duree = Number(bien.duree_credit)
  if (!taux || !duree || !bien.date_acquisition) return { montant: K, estime: true }
  const r = taux / 100 / 12
  const M = K * r / (1 - Math.pow(1 + r, -duree))
  const n = mensualitesVersees(bien, ref)
  const crd = K * Math.pow(1 + r, n) - M * (Math.pow(1 + r, n) - 1) / r
  return { montant: Math.max(0, crd), estime: false }
}

/** Intérêts d'emprunt payés sur une année civile (somme des parts d'intérêt
 *  des mensualités de l'année). 0 si les termes du prêt manquent. */
export const interetsAnnee = (bien, annee) => {
  const K = Number(bien.montant_emprunt || 0)
  const taux = Number(bien.taux_interet)
  const duree = Number(bien.duree_credit)
  if (K <= 0 || !taux || !duree || !bien.date_acquisition) return 0
  const r = taux / 100 / 12
  const M = K * r / (1 - Math.pow(1 + r, -duree))
  const debut = new Date(bien.date_acquisition)
  debut.setMonth(debut.getMonth() + Number(bien.decalage_pret || 0))
  let total = 0
  let crd = K
  for (let n = 0; n < duree; n++) {
    const date = new Date(debut.getFullYear(), debut.getMonth() + n, 1)
    const interet = crd * r
    if (date.getFullYear() === annee) total += interet
    if (date.getFullYear() > annee) break
    crd -= M - interet
  }
  return total
}
