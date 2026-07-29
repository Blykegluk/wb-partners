// Logique métier de l'agrégation bancaire : persistance des sessions et des
// comptes, synchronisation des mouvements, rapprochement des loyers.
//
// Les Edge Functions restent minces et ne font qu'appeler ces fonctions.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EbError,
  getTransactions,
  ibanDeCompte,
  nomContrepartie,
  normaliserLibelle,
  referenceStable,
  ebJson,
  type EbAccount,
  type EbSessionResponse,
  type EbTransaction,
} from "./enablebanking.ts";
import {
  rapprocher,
  type ContexteBail,
  type Echeance,
  type Mouvement,
} from "./rapprochement.ts";

/** Nombre de jours d'historique demandé à la première synchronisation. */
const JOURS_HISTORIQUE = 365;

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ── Persistance du consentement ─────────────────────────────

/** Compare des IBAN sans se soucier des espaces ni de la casse. */
function clefIban(iban: string | null | undefined): string {
  return (iban ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * Détermine la société de rattachement de chaque compte.
 *
 * Une connexion ne rapporte pas les comptes d'une société mais tous ceux
 * auxquels l'identifiant utilisé donne accès — un accès professionnel expose
 * couramment les comptes de plusieurs sociétés du groupe. La société choisie à
 * l'écran n'est donc qu'un défaut, appliqué à ce qu'on ne sait pas rattacher
 * autrement.
 *
 * Deux signaux le précèdent : une affectation déjà enregistrée, qui a pu être
 * corrigée à la main et ne doit pas être écrasée au renouvellement du
 * consentement ; et l'IBAN déjà renseigné sur une société, saisi délibérément
 * et plus fiable que l'écran depuis lequel on a cliqué.
 */
async function resoudreSocietes(
  supabase: SupabaseClient,
  comptes: EbAccount[],
  defaut: string | null,
): Promise<Map<string, string | null>> {
  const { data: societes } = await supabase
    .from("societe").select("id, iban").not("iban", "is", null);
  const parIban = new Map<string, string>();
  for (const s of societes ?? []) {
    const clef = clefIban(s.iban as string);
    if (clef) parIban.set(clef, s.id as string);
  }

  const { data: existants } = await supabase
    .from("bank_accounts").select("account_uid, societe_id")
    .in("account_uid", comptes.map((c) => c.uid));
  const dejaAffectes = new Map(
    (existants ?? [])
      .filter((c) => c.societe_id)
      .map((c) => [c.account_uid as string, c.societe_id as string]),
  );

  return new Map(comptes.map((c) => [
    c.uid,
    dejaAffectes.get(c.uid) ?? parIban.get(clefIban(ibanDeCompte(c))) ?? defaut,
  ]));
}

/**
 * Enregistre la session et TOUS les comptes retournés par POST /sessions.
 *
 * Cette réponse est la seule occasion d'obtenir certaines informations de
 * compte : on persiste donc immédiatement, payload brut compris, avant toute
 * autre opération.
 */
export async function persisterSession(
  supabase: SupabaseClient,
  session: EbSessionResponse,
  societeId: string | null,
): Promise<{ comptes: number }> {
  const { error: eSession } = await supabase.from("bank_sessions").upsert({
    session_id: session.session_id,
    societe_id: societeId,
    psu_id_hash: session.psu_id_hash ?? null,
    valid_until: session.access?.valid_until ?? null,
    status: "active",
  }, { onConflict: "session_id" });

  if (eSession) throw new Error(`Enregistrement de la session : ${eSession.message}`);

  const comptes: EbAccount[] = session.accounts ?? [];
  const rattachements = await resoudreSocietes(supabase, comptes, societeId);

  for (const compte of comptes) {
    const { error } = await supabase.from("bank_accounts").upsert({
      session_id: session.session_id,
      societe_id: rattachements.get(compte.uid) ?? societeId,
      account_uid: compte.uid,
      iban: ibanDeCompte(compte),
      name: compte.name ?? null,
      currency: compte.currency ?? null,
      product: compte.product ?? null,
      session_status: "active",
      raw: compte,
    }, { onConflict: "account_uid" });

    if (error) throw new Error(`Enregistrement du compte ${compte.uid} : ${error.message}`);
  }

  return { comptes: comptes.length };
}

// ── Synchronisation ─────────────────────────────────────────

interface CompteDb {
  account_uid: string;
  societe_id: string | null;
  session_id: string;
  suivi: boolean;
  currency: string | null;
}

/** Marque une session expirée et ses comptes avec elle. */
async function marquerSessionExpiree(supabase: SupabaseClient, sessionId: string) {
  await supabase.from("bank_sessions").update({ status: "expired" }).eq("session_id", sessionId);
  await supabase.from("bank_accounts").update({ session_status: "expired" }).eq("session_id", sessionId);
}

/**
 * Récupère et enregistre les mouvements d'un compte, en suivant la pagination.
 * Renvoie le nombre de mouvements traités, ou null si la session a expiré.
 */
export async function synchroniserCompte(
  supabase: SupabaseClient,
  compte: CompteDb,
): Promise<number | null> {
  const depuis = new Date(Date.now() - JOURS_HISTORIQUE * 86400000)
    .toISOString().slice(0, 10);

  let continuationKey: string | undefined;
  let total = 0;

  do {
    let page;
    try {
      page = await getTransactions(compte.account_uid, {
        continuationKey,
        dateFrom: continuationKey ? undefined : depuis,
      });
    } catch (err) {
      // 401 : le consentement a expiré ou été révoqué. On le consigne plutôt
      // que de laisser la synchronisation échouer.
      if (err instanceof EbError && (err.status === 401 || err.status === 403)) {
        console.warn(`[banking] session expirée pour ${compte.account_uid}`);
        await marquerSessionExpiree(supabase, compte.session_id);
        return null;
      }
      throw err;
    }

    for (const tx of page.transactions ?? []) {
      await enregistrerMouvement(supabase, compte, tx);
      total++;
    }

    continuationKey = page.continuation_key;
  } while (continuationKey);

  await supabase.from("bank_accounts")
    .update({ derniere_sync: new Date().toISOString(), session_status: "active" })
    .eq("account_uid", compte.account_uid);

  return total;
}

async function enregistrerMouvement(
  supabase: SupabaseClient,
  compte: CompteDb,
  tx: EbTransaction,
) {
  const reference = await referenceStable(compte.account_uid, tx);
  const montant = Number(tx.transaction_amount?.amount ?? 0);
  // Enable Banking exprime toujours un montant positif : le sens est porté par
  // credit_debit_indicator. On stocke un montant signé, plus simple à agréger.
  const signe = tx.credit_debit_indicator === "DBIT" ? -1 : 1;

  const { error } = await supabase.from("bank_transactions").upsert({
    account_uid: compte.account_uid,
    societe_id: compte.societe_id,
    entry_reference: reference,
    booking_date: tx.booking_date ?? null,
    value_date: tx.value_date ?? null,
    amount: montant * signe,
    currency: tx.transaction_amount?.currency ?? compte.currency,
    credit_debit: tx.credit_debit_indicator ?? null,
    remittance_information: normaliserLibelle(tx) || null,
    counterparty_name: nomContrepartie(tx),
    raw: tx,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: "account_uid,entry_reference",
    // Ne jamais écraser un rapprochement déjà établi : les colonnes de
    // rapprochement ne figurent pas dans le payload, elles sont donc
    // préservées par l'upsert.
    ignoreDuplicates: false,
  });

  if (error) throw new Error(`Mouvement ${reference} : ${error.message}`);
}

/** Met à jour les soldes affichés dans l'écran Banque. */
export async function rafraichirSoldes(supabase: SupabaseClient, accountUid: string) {
  try {
    const data = await ebJson<{ balances?: Array<{ balance_amount?: { amount?: string } }> }>(
      `/accounts/${encodeURIComponent(accountUid)}/balances`,
    );
    const solde = data.balances?.[0]?.balance_amount?.amount;
    if (solde != null) {
      await supabase.from("bank_accounts")
        .update({ solde: Number(solde) })
        .eq("account_uid", accountUid);
    }
  } catch (err) {
    // Un solde indisponible ne doit pas faire échouer la synchronisation.
    console.warn(`[banking] solde indisponible pour ${accountUid} :`, err);
  }
}

// ── Rapprochement ───────────────────────────────────────────

/**
 * Rapproche les crédits non qualifiés avec les échéances ouvertes, via le
 * moteur de scoring partagé. Renvoie les compteurs pour l'interface.
 */
export async function rapprocherSociete(
  supabase: SupabaseClient,
  societeId: string,
): Promise<{ rapproches: number; suggeres: number }> {
  const { data: baux } = await supabase.from("baux")
    .select("id, locataire_id, tva_applicable, taux_tva")
    .eq("societe_id", societeId).eq("actif", true);

  if (!baux || baux.length === 0) return { rapproches: 0, suggeres: 0 };

  const { data: echRows } = await supabase.from("transactions")
    .select("id, bail_id, mois, annee, montant_loyer, montant_charges")
    .in("bail_id", baux.map((b) => b.id))
    .in("statut", ["impayé", "en_attente"]);

  // Le taux du bail voyage avec l'échéance : le moteur compare des montants
  // bancaires, donc TTC, à un échéancier tenu en HT.
  const tauxParBail = new Map(
    baux.map((b) => [
      b.id as string,
      b.tva_applicable === false ? 0 : Number(b.taux_tva ?? 20),
    ]),
  );
  const echeances = (echRows ?? []).map((e) => ({
    ...e,
    taux_tva: tauxParBail.get(e.bail_id as string) ?? 0,
  }));

  const { data: locataires } = await supabase.from("locataires")
    .select("id, raison_sociale, nom, prenom").eq("societe_id", societeId);

  const contextes = new Map<string, ContexteBail>();
  for (const b of baux) {
    const loc = (locataires ?? []).find((l) => l.id === b.locataire_id);
    contextes.set(b.id, {
      bail_id: b.id,
      noms: [loc?.raison_sociale, loc?.nom, `${loc?.prenom ?? ""} ${loc?.nom ?? ""}`]
        .filter((x): x is string => !!x && x.trim().length > 0),
    });
  }

  // Crédits en euros non encore qualifiés, sur les comptes suivis.
  const { data: comptes } = await supabase.from("bank_accounts")
    .select("account_uid, suivi").eq("societe_id", societeId);
  const suivis = new Set(
    (comptes ?? []).filter((c) => c.suivi !== false).map((c) => c.account_uid),
  );

  const { data: credits } = await supabase.from("bank_transactions")
    .select("id, booking_date, amount, remittance_information, counterparty_name, account_uid")
    .eq("societe_id", societeId)
    .eq("statut_rapprochement", "a_qualifier")
    .eq("currency", "EUR")
    .gt("amount", 0);

  const disponibles = (credits ?? []).filter((c) => suivis.has(c.account_uid));

  // Adaptation au moteur, qui raisonne sur des couples génériques.
  const mouvements: Mouvement[] = disponibles.map((c) => ({
    id: c.id as string,
    date: c.booking_date as string,
    montant: Number(c.amount),
    libelle: (c.remittance_information as string | null) ?? null,
    // Le nom de la contrepartie est souvent plus parlant que le libellé pour
    // reconnaître un locataire : on le donne au moteur comme second libellé.
    libelle_brut: (c.counterparty_name as string | null) ?? null,
    operation_type: "transfer",
  }));

  const { data: apprisRows } = await supabase.from("rapprochement_appris")
    .select("empreinte, bail_id").eq("societe_id", societeId);
  const appris = new Map<string, string>(
    (apprisRows ?? []).map((r) => [r.empreinte as string, r.bail_id as string]),
  );

  const { affectations, suggestions } = rapprocher(
    echeances as Echeance[],
    mouvements,
    contextes,
    appris,
  );

  for (const a of affectations) {
    const mvt = disponibles.find((c) => c.id === a.transaction_id);
    await supabase.from("bank_transactions").update({
      statut_rapprochement: "rapproche_auto",
      transaction_id: a.echeance_id,
      score_confiance: Math.round(a.score * 100) / 100,
      suggestions: null,
      rapproche_le: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", a.transaction_id);

    await supabase.from("transactions").update({
      statut: "payé",
      date_paiement: mvt?.booking_date ?? new Date().toISOString().slice(0, 10),
    }).eq("id", a.echeance_id);
  }

  let suggeres = 0;
  for (const [mvtId, liste] of suggestions) {
    await supabase.from("bank_transactions")
      .update({ suggestions: liste, updated_at: new Date().toISOString() })
      .eq("id", mvtId);
    suggeres++;
  }

  return { rapproches: affectations.length, suggeres };
}

// ── Orchestration ───────────────────────────────────────────

export interface ResultatSync {
  comptes: number;
  mouvements: number;
  rapproches: number;
  suggeres: number;
  sessions_expirees: number;
}

/** Synchronise tous les comptes d'une société, puis rapproche. */
export async function synchroniserSociete(
  supabase: SupabaseClient,
  societeId: string,
): Promise<ResultatSync> {
  const { data: comptes } = await supabase.from("bank_accounts")
    .select("account_uid, societe_id, session_id, suivi, currency")
    .eq("societe_id", societeId);

  if (!comptes || comptes.length === 0) {
    throw new Error("Aucun compte bancaire connecté pour cette société");
  }

  let mouvements = 0;
  let expirees = 0;

  for (const compte of comptes as CompteDb[]) {
    const n = await synchroniserCompte(supabase, compte);
    if (n === null) { expirees++; continue; }
    mouvements += n;
    await rafraichirSoldes(supabase, compte.account_uid);
  }

  const { rapproches, suggeres } = await rapprocherSociete(supabase, societeId);

  return {
    comptes: comptes.length,
    mouvements,
    rapproches,
    suggeres,
    sessions_expirees: expirees,
  };
}
