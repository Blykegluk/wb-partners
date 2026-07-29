// Nature des mouvements bancaires qui ne correspondent pas à une échéance de
// loyer. La terminologie suit l'usage comptable français, ces libellés étant
// destinés à être repris tels quels dans les documents financiers.
//
// Le sens du montant détermine la liste proposée : un crédit ne peut pas être
// une taxe foncière, un débit ne peut pas être un dépôt de garantie reçu.

export const RECETTES = [
  { v: 'loyer_hors_echeance', l: 'Loyer (hors échéance suivie)' },
  { v: 'charges_refacturees', l: 'Refacturation de charges' },
  { v: 'depot_garantie_recu', l: 'Dépôt de garantie reçu' },
  { v: 'indemnite_resiliation', l: 'Indemnité de résiliation de bail' },
  { v: 'indemnite_eviction', l: 'Indemnité d’éviction' },
  { v: 'indemnite_assurance', l: 'Indemnité d’assurance' },
  { v: 'apport_cca', l: 'Apport en compte courant d’associé' },
  { v: 'apport_capital', l: 'Apport en capital' },
  { v: 'emprunt_debloque', l: 'Déblocage de prêt' },
  { v: 'produit_cession', l: 'Produit de cession' },
  { v: 'subvention', l: 'Subvention' },
  { v: 'interets_percus', l: 'Intérêts perçus' },
  { v: 'autre_recette', l: 'Autre recette' },
]

export const DEPENSES = [
  { v: 'travaux', l: 'Travaux' },
  { v: 'charges_copropriete', l: 'Charges de copropriété' },
  { v: 'taxe_fonciere', l: 'Taxe foncière' },
  { v: 'taxe_bureaux', l: 'Taxe sur les bureaux' },
  { v: 'assurance', l: 'Assurance' },
  { v: 'honoraires', l: 'Honoraires (gestion, comptabilité, conseil)' },
  { v: 'echeance_pret', l: 'Échéance de prêt' },
  { v: 'frais_bancaires', l: 'Frais bancaires' },
  { v: 'restitution_depot', l: 'Restitution de dépôt de garantie' },
  { v: 'remboursement_cca', l: 'Remboursement de compte courant d’associé' },
  { v: 'dividendes', l: 'Distribution de dividendes' },
  { v: 'impots_taxes', l: 'Impôts et taxes' },
  { v: 'charges_diverses', l: 'Charges diverses' },
  { v: 'autre_depense', l: 'Autre dépense' },
]

/** Liste applicable au sens du mouvement. */
export const categoriesPour = (montant) => (Number(montant) > 0 ? RECETTES : DEPENSES)

const TOUTES = [...RECETTES, ...DEPENSES]

/** Libellé d'une catégorie, ou la valeur brute si elle n'est plus au catalogue. */
export const libelleCategorie = (v) => TOUTES.find((c) => c.v === v)?.l || v || '—'
