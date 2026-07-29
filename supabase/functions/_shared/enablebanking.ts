// Client Enable Banking (API AIS, lecture seule).
//
// L'API n'utilise pas d'OAuth applicatif : chaque requête porte un JWT RS256
// signé par la clé privée de l'application, dont l'empreinte publique est
// enregistrée dans le Control Panel. Le `kid` de l'en-tête désigne
// l'application ; c'est ce qui permet à Enable Banking de retrouver la clé
// publique correspondante.
//
// Secrets attendus (supabase secrets set) :
//   ENABLEBANKING_APP_ID       identifiant de l'application
//   ENABLEBANKING_PRIVATE_KEY  clé privée RSA au format PEM PKCS8

import * as jose from "npm:jose@5";

const API_BASE = "https://api.enablebanking.com";
const ISSUER = "enablebanking.com";
const AUDIENCE = "api.enablebanking.com";

/** Durée de vie du JWT, en secondes. */
const TOKEN_TTL = 3600;
/** Marge avant expiration en deçà de laquelle on resigne un jeton. */
const TOKEN_RENEW_MARGIN = 60;

// ── Types ───────────────────────────────────────────────────

export interface EbAccount {
  uid: string;
  account_id?: { iban?: string; other?: { identification?: string } };
  name?: string;
  currency?: string;
  product?: string;
  [k: string]: unknown;
}

export interface EbSessionResponse {
  session_id: string;
  accounts?: EbAccount[];
  access?: { valid_until?: string };
  psu_id_hash?: string;
  [k: string]: unknown;
}

export interface EbAspsp {
  name: string;
  country: string;
  psu_types?: Array<"business" | "personal">;
  [k: string]: unknown;
}

export interface EbAuthResponse {
  url: string;
  authorization_id?: string;
  psu_id_hash?: string;
  [k: string]: unknown;
}

export interface EbTransaction {
  entry_reference?: string;
  booking_date?: string;
  value_date?: string;
  transaction_amount?: { amount?: string; currency?: string };
  credit_debit_indicator?: "CRDT" | "DBIT";
  remittance_information?: string[] | string;
  creditor?: { name?: string };
  debtor?: { name?: string };
  [k: string]: unknown;
}

export interface EbTransactionsPage {
  transactions?: EbTransaction[];
  continuation_key?: string;
  [k: string]: unknown;
}

/**
 * Erreur portant le statut HTTP, pour que les appelants distinguent un 401
 * (session expirée → marquer la session, ne pas planter) d'une panne réelle.
 */
export class EbError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`Enable Banking ${status} sur ${path} : ${body.slice(0, 500)}`);
    this.name = "EbError";
  }
}

// ── Signature ───────────────────────────────────────────────

// jose.importPKCS8 renvoie un KeyLike (CryptoKey sous Deno, KeyObject sous
// Node) — typer en CryptoKey ne compilerait pas en mode strict.
let cachedKey: jose.KeyLike | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(
      `Secret ${name} manquant. Créez-le avec : supabase secrets set ${name}=...`,
    );
  }
  return v;
}

/**
 * Importe la clé privée PKCS8 depuis le secret, une seule fois par instance.
 *
 * Les secrets Supabase conservent les retours à la ligne, mais une valeur
 * collée depuis un terminal peut arriver avec des `\n` littéraux : on les
 * rétablit pour éviter un « Invalid keyData » peu parlant.
 */
export async function getPrivateKey(): Promise<jose.KeyLike> {
  if (cachedKey) return cachedKey;

  const pem = requireEnv("ENABLEBANKING_PRIVATE_KEY").replace(/\\n/g, "\n").trim();

  if (!pem.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "ENABLEBANKING_PRIVATE_KEY n'est pas au format PKCS8 (en-tête « BEGIN PRIVATE KEY » attendu). " +
        "Une clé « BEGIN RSA PRIVATE KEY » est au format PKCS1 : convertissez-la avec " +
        "openssl pkcs8 -topk8 -nocrypt -in cle.pem -out cle_pkcs8.pem",
    );
  }

  const key = await jose.importPKCS8(pem, "RS256");
  cachedKey = key;
  return key;
}

/**
 * JWT d'authentification, mis en cache jusqu'à peu avant son expiration :
 * resigner à chaque appel coûterait une opération RSA par requête, alors qu'un
 * jeton est valable une heure.
 */
export async function getToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && cachedToken.expiresAt - TOKEN_RENEW_MARGIN > now) {
    return cachedToken.value;
  }

  const appId = requireEnv("ENABLEBANKING_APP_ID");
  const key = await getPrivateKey();
  const exp = now + TOKEN_TTL;

  const value = await new jose.SignJWT({})
    .setProtectedHeader({ typ: "JWT", alg: "RS256", kid: appId })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);

  cachedToken = { value, expiresAt: exp };
  return value;
}

// ── Appels API ──────────────────────────────────────────────

/**
 * Appel authentifié à l'API. `path` est relatif (« /auth », « /sessions »…).
 * Lève une EbError sur réponse non-2xx, en journalisant de quoi diagnostiquer
 * depuis les logs du dashboard Supabase.
 */
export async function ebFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[enablebanking] ${init.method ?? "GET"} ${path} → ${res.status}`,
      body.slice(0, 1000),
    );
    throw new EbError(res.status, path, body);
  }

  return res;
}

/** Variante JSON : la quasi-totalité des appels renvoie du JSON. */
export async function ebJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await ebFetch(path, init);
  return await res.json() as T;
}

// ── Opérations métier ───────────────────────────────────────

/**
 * Banques disponibles dans un pays.
 *
 * Les noms doivent être repris au caractère près, accents compris, sinon /auth
 * répond 422 WRONG_ASPSP_PROVIDED. C'est la raison pour laquelle la liste est
 * lue ici plutôt que recopiée dans l'interface : une liste écrite à la main se
 * désynchronise, et la Caisse d'Épargne n'existe d'ailleurs pas comme entité
 * unique — elle est déclinée en une quinzaine de caisses régionales.
 */
export async function getAspsps(country = "FR"): Promise<EbAspsp[]> {
  const data = await ebJson<{ aspsps?: EbAspsp[] }>(
    `/aspsps?country=${encodeURIComponent(country)}`,
  );
  return data.aspsps ?? [];
}

/**
 * Démarre un consentement. Renvoie l'URL vers laquelle rediriger l'utilisateur.
 * `validUntil` borne la durée de l'accès (90 jours par défaut).
 */
export function startAuthorization(params: {
  aspspName: string;
  aspspCountry: string;
  redirectUrl: string;
  state: string;
  validUntil?: Date;
  psuType?: "business" | "personal";
}): Promise<EbAuthResponse> {
  const validUntil = params.validUntil ??
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  return ebJson<EbAuthResponse>("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: {
        balances: true,
        transactions: true,
        valid_until: validUntil.toISOString(),
      },
      aspsp: { name: params.aspspName, country: params.aspspCountry },
      psu_type: params.psuType ?? "business",
      redirect_url: params.redirectUrl,
      state: params.state,
    }),
  });
}

/**
 * Échange le code de retour contre une session.
 *
 * La réponse contient le session_id ET la liste complète des comptes, avec des
 * informations qui ne sont retournées qu'ici : l'appelant doit tout persister
 * immédiatement, payload brut compris.
 */
export function createSession(code: string): Promise<EbSessionResponse> {
  return ebJson<EbSessionResponse>("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/**
 * Une page de mouvements. `continuationKey` enchaîne les pages suivantes.
 */
export function getTransactions(
  accountUid: string,
  options: { continuationKey?: string; dateFrom?: string } = {},
): Promise<EbTransactionsPage> {
  const qs = new URLSearchParams();
  if (options.continuationKey) qs.set("continuation_key", options.continuationKey);
  if (options.dateFrom) qs.set("date_from", options.dateFrom);
  const suffix = qs.toString() ? `?${qs}` : "";

  return ebJson<EbTransactionsPage>(
    `/accounts/${encodeURIComponent(accountUid)}/transactions${suffix}`,
  );
}

// ── Normalisation ───────────────────────────────────────────

/**
 * Référence stable d'un mouvement.
 *
 * L'unicité (account_uid, entry_reference) est ce qui rend la synchronisation
 * idempotente ; or certaines banques ne fournissent pas d'entry_reference, et
 * deux NULL n'étant pas égaux en SQL, ces mouvements seraient réinsérés à
 * chaque passage. On dérive donc une empreinte déterministe à partir des
 * champs stables du mouvement.
 */
export async function referenceStable(
  accountUid: string,
  tx: EbTransaction,
): Promise<string> {
  if (tx.entry_reference) return tx.entry_reference;

  const parts = [
    accountUid,
    tx.booking_date ?? "",
    tx.value_date ?? "",
    tx.transaction_amount?.amount ?? "",
    tx.transaction_amount?.currency ?? "",
    tx.credit_debit_indicator ?? "",
    normaliserLibelle(tx),
  ].join("|");

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Préfixe explicite : on doit pouvoir distinguer une référence dérivée d'une
  // référence fournie par la banque.
  return `derive:${hex.slice(0, 32)}`;
}

/** Le libellé arrive tantôt en chaîne, tantôt en tableau de lignes. */
export function normaliserLibelle(tx: EbTransaction): string {
  const r = tx.remittance_information;
  if (!r) return "";
  return Array.isArray(r) ? r.filter(Boolean).join(" ").trim() : String(r).trim();
}

/** Le tiers est le créditeur ou le débiteur selon le sens de l'opération. */
export function nomContrepartie(tx: EbTransaction): string | null {
  const nom = tx.credit_debit_indicator === "CRDT"
    ? tx.debtor?.name
    : tx.creditor?.name;
  return nom?.trim() || null;
}

/** IBAN du compte, quel que soit l'emplacement où la banque le place. */
export function ibanDeCompte(account: EbAccount): string | null {
  return account.account_id?.iban ??
    account.account_id?.other?.identification ??
    null;
}
