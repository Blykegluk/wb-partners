// Moteur de rapprochement bancaire.
//
// Remplace la logique « premier mouvement dont le montant colle » par un
// score de confiance combinant plusieurs signaux, puis une affectation
// gloutonne globale : le meilleur couple (échéance, mouvement) est attribué
// en premier, ce qui évite qu'une échéance traitée tôt monopolise un virement
// qui correspondait bien mieux à une autre.
//
// Parti pris prudent : un rapprochement automatique erroné marque une
// échéance comme payée et coupe donc une relance légitime. En cas de doute —
// score insuffisant ou deux candidats trop proches — on ne tranche pas, on
// propose.

export interface Echeance {
  id: string;
  bail_id: string;
  mois: number;          // 0-11
  annee: number;
  /** Montants tenus en HT, comme dans tout l'échéancier. */
  montant_loyer: number;
  montant_charges: number;
  /** Taux de TVA du bail, en points (20 = 20 %). 0 si non assujetti. */
  taux_tva?: number;
}

export interface Mouvement {
  id: string;
  date: string;          // ISO yyyy-mm-dd
  montant: number;       // signé
  libelle: string | null;
  libelle_brut: string | null;
  operation_type: string | null;
}

export interface ContexteBail {
  bail_id: string;
  /** Noms rattachés au bail : raison sociale, nom, prénom du locataire. */
  noms: string[];
}

export interface Suggestion {
  transaction_id: string;
  score: number;
  raisons: string[];
}

// ── Réglages ────────────────────────────────────────────────
// Regroupés ici pour pouvoir desserrer le dispositif d'un seul endroit une
// fois l'apprentissage nourri par les qualifications manuelles.
export const REGLAGES = {
  toleranceStricte: 0.02,     // 2 %
  toleranceLarge: 0.05,       // 5 %
  joursAvant: 10,
  joursApres: 120,
  seuilAuto: 0.75,            // score minimal pour un rapprochement auto
  ecartAmbiguite: 0.15,       // écart minimal avec le 2e candidat
  maxSuggestions: 3,
};

// ── Normalisation ───────────────────────────────────────────

/** Majuscules, sans accents, ponctuation réduite à des espaces. */
export function normaliser(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

// Mots trop courants dans les libellés bancaires pour être discriminants.
const MOTS_VIDES = new Set([
  "VIR", "VIREMENT", "SEPA", "INST", "RECU", "DE", "DU", "LA", "LE", "LES",
  "M", "MME", "MR", "SARL", "SAS", "SCI", "SASU", "EURL", "SA", "ET",
  "PRLV", "PAIEMENT", "CB", "CARTE", "REF", "REFERENCE",
]);

function tokens(s: string): string[] {
  return normaliser(s).split(" ").filter((t) => t.length >= 3 && !MOTS_VIDES.has(t));
}

/**
 * Référence de virement générée par l'application sur les avis d'échéance :
 * LOY-<6 premiers caractères de l'id du bail>-<MMAAAA>.
 * Sa présence dans le libellé est un signal quasi certain.
 */
export function referenceAttendue(bailId: string, mois: number, annee: number): string {
  const code = (bailId || "").slice(0, 6).toUpperCase();
  return `LOY ${code} ${String(mois + 1).padStart(2, "0")}${annee}`;
}

/**
 * Empreinte d'un libellé bancaire : jetons significatifs, dédoublonnés et
 * triés. Deux virements du même émetteur partagent la même empreinte même si
 * la banque intercale une date ou une référence variable.
 *
 * Renvoie "" si le libellé ne contient rien de discriminant — auquel cas il
 * ne faut surtout rien mémoriser.
 */
export function empreinte(libelle: string | null | undefined): string {
  const tk = Array.from(new Set(tokens(libelle || "")))
    .filter((t) => !/^\d+$/.test(t))   // écarte les dates et numéros
    .sort();
  return tk.length >= 2 ? tk.join(" ") : "";
}

// ── Score d'un couple ───────────────────────────────────────

export function scorer(
  ech: Echeance,
  mvt: Mouvement,
  ctx: ContexteBail | undefined,
  /** empreinte → bail_id, alimenté par les rapprochements manuels passés. */
  appris?: Map<string, string>,
): { score: number; raisons: string[] } {
  const raisons: string[] = [];

  const attendu = Number(ech.montant_loyer || 0) + Number(ech.montant_charges || 0);
  const loyerSeul = Number(ech.montant_loyer || 0);
  const montant = Number(mvt.montant || 0);
  if (attendu <= 0 || montant <= 0) return { score: 0, raisons: [] };

  // 1. Montant — éliminatoire.
  //
  // L'échéancier est tenu en HT, la banque encaisse du TTC. Comparer les deux
  // directement condamnait tout bail assujetti : 8 500 attendus contre 10 200
  // reçus font 20 % d'écart, très au-delà de la tolérance la plus large.
  //
  // On retient l'écart le plus faible parmi les montants plausibles : total ou
  // loyer seul — le locataire règle parfois les charges à part — et TTC ou HT,
  // ce dernier couvrant le cas d'un locataire qui omet la taxe.
  const coef = 1 + Number(ech.taux_tva || 0) / 100;
  const references = [attendu * coef, loyerSeul * coef, attendu, loyerSeul]
    .filter((r) => r > 0);
  const ecart = Math.min(...references.map((r) => Math.abs(montant - r) / r));

  let scoreMontant: number;
  if (ecart < 0.0001) {
    scoreMontant = 0.50;
    raisons.push("Montant exact");
  } else if (ecart <= REGLAGES.toleranceStricte) {
    scoreMontant = 0.45;
    raisons.push(`Montant à ${(ecart * 100).toFixed(1)} % près`);
  } else if (ecart <= REGLAGES.toleranceLarge) {
    scoreMontant = 0.30;
    raisons.push(`Montant approchant (${(ecart * 100).toFixed(1)} % d'écart)`);
  } else {
    return { score: 0, raisons: [] };
  }

  // 2. Fenêtre temporelle — éliminatoire.
  const due = Date.UTC(ech.annee, ech.mois, 1);
  const d = new Date(mvt.date).getTime();
  const jours = Math.round((d - due) / 86400000);
  if (jours < -REGLAGES.joursAvant || jours > REGLAGES.joursApres) {
    return { score: 0, raisons: [] };
  }

  let scoreDate: number;
  if (jours <= 15) {
    scoreDate = 0.25;
    raisons.push("Reçu dans les délais");
  } else if (jours <= 45) {
    scoreDate = 0.18;
    raisons.push(`Reçu avec ${jours} jours de décalage`);
  } else {
    scoreDate = 0.10;
    raisons.push(`Reçu avec ${jours} jours de retard`);
  }

  // 3. Libellé.
  const libelle = `${mvt.libelle || ""} ${mvt.libelle_brut || ""}`;
  const libelleNorm = normaliser(libelle);
  let scoreLibelle = 0;

  // Émetteur déjà rapproché manuellement sur ce bail : signal le plus fort
  // après la référence de virement, puisqu'il vient d'une confirmation humaine.
  const emp = empreinte(libelle);
  const bailAppris = emp && appris ? appris.get(emp) : undefined;

  const ref = referenceAttendue(ech.bail_id, ech.mois, ech.annee);
  if (ref && libelleNorm.includes(ref)) {
    scoreLibelle = 0.40;
    raisons.push("Référence de virement reconnue");
  } else if (bailAppris === ech.bail_id) {
    scoreLibelle = 0.35;
    raisons.push("Émetteur déjà rattaché à ce bail");
  } else if (bailAppris && bailAppris !== ech.bail_id) {
    // Cet émetteur est connu pour un AUTRE bail : signal négatif net.
    scoreLibelle = -0.30;
    raisons.push("Émetteur habituellement rattaché à un autre bail");
  } else if (ctx) {
    const tokensLibelle = new Set(tokens(libelle));
    let meilleur = 0;
    for (const nom of ctx.noms) {
      const tk = tokens(nom);
      if (tk.length === 0) continue;
      const communs = tk.filter((t) => tokensLibelle.has(t)).length;
      const ratio = communs / tk.length;
      if (ratio > meilleur) meilleur = ratio;
    }
    if (meilleur >= 0.99) {
      scoreLibelle = 0.25;
      raisons.push("Nom du locataire dans le libellé");
    } else if (meilleur >= 0.5) {
      scoreLibelle = 0.15;
      raisons.push("Libellé partiellement concordant");
    }
  }

  // 4. Nature de l'opération : un loyer arrive par virement.
  let scoreType = 0;
  const op = (mvt.operation_type || "").toLowerCase();
  if (op === "transfer") {
    scoreType = 0.05;
  } else if (op === "card" || op === "direct_debit") {
    scoreType = -0.10;
    raisons.push("Nature de l'opération inhabituelle pour un loyer");
  }

  const score = Math.max(0, Math.min(1, scoreMontant + scoreDate + scoreLibelle + scoreType));
  return { score, raisons };
}

// ── Affectation globale ─────────────────────────────────────

export interface Affectation {
  echeance_id: string;
  transaction_id: string;
  score: number;
  raisons: string[];
  /** true si le score et l'absence d'ambiguïté autorisent l'automatisme. */
  auto: boolean;
}

export interface ResultatRapprochement {
  affectations: Affectation[];
  /** Suggestions par mouvement resté non affecté, pour l'écran Banque. */
  suggestions: Map<string, Suggestion[]>;
}

export function rapprocher(
  echeances: Echeance[],
  mouvements: Mouvement[],
  contextes: Map<string, ContexteBail>,
  appris?: Map<string, string>,
): ResultatRapprochement {
  // Tous les couples plausibles, meilleurs scores d'abord.
  const couples: Array<{ ech: Echeance; mvt: Mouvement; score: number; raisons: string[] }> = [];
  for (const ech of echeances) {
    for (const mvt of mouvements) {
      const { score, raisons } = scorer(ech, mvt, contextes.get(ech.bail_id), appris);
      if (score > 0) couples.push({ ech, mvt, score, raisons });
    }
  }
  couples.sort((a, b) => b.score - a.score);

  const echUtilisees = new Set<string>();
  const mvtUtilises = new Set<string>();
  const affectations: Affectation[] = [];

  for (const c of couples) {
    if (echUtilisees.has(c.ech.id) || mvtUtilises.has(c.mvt.id)) continue;

    // Un concurrent proche sur la même échéance ou le même mouvement rend
    // l'attribution incertaine : on laisse l'humain trancher.
    const concurrents = couples.filter(
      (x) =>
        x !== c &&
        (x.ech.id === c.ech.id || x.mvt.id === c.mvt.id) &&
        !echUtilisees.has(x.ech.id) &&
        !mvtUtilises.has(x.mvt.id),
    );
    const meilleurConcurrent = concurrents.reduce((max, x) => Math.max(max, x.score), 0);
    const ambigu = meilleurConcurrent > 0 &&
      c.score - meilleurConcurrent < REGLAGES.ecartAmbiguite;

    const auto = c.score >= REGLAGES.seuilAuto && !ambigu;

    if (auto) {
      echUtilisees.add(c.ech.id);
      mvtUtilises.add(c.mvt.id);
      affectations.push({
        echeance_id: c.ech.id,
        transaction_id: c.mvt.id,
        score: c.score,
        raisons: c.raisons,
        auto: true,
      });
    }
  }

  // Suggestions pour les mouvements non rapprochés automatiquement.
  const suggestions = new Map<string, Suggestion[]>();
  for (const c of couples) {
    if (mvtUtilises.has(c.mvt.id) || echUtilisees.has(c.ech.id)) continue;
    const liste = suggestions.get(c.mvt.id) || [];
    if (liste.length < REGLAGES.maxSuggestions) {
      liste.push({
        transaction_id: c.ech.id,
        score: Math.round(c.score * 100) / 100,
        raisons: c.raisons,
      });
      suggestions.set(c.mvt.id, liste);
    }
  }

  return { affectations, suggestions };
}
