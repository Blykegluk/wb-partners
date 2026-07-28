import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  rapprocher,
  type ContexteBail,
  type Echeance,
  type Mouvement,
} from "../_shared/rapprochement.ts";

const BRIDGE_CLIENT_ID = Deno.env.get("BRIDGE_CLIENT_ID");
const BRIDGE_CLIENT_SECRET = Deno.env.get("BRIDGE_CLIENT_SECRET");
const BRIDGE_VERSION = "2025-01-15";
const BRIDGE_BASE = "https://api.bridgeapi.io/v3/aggregation";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Historique récupéré à chaque synchronisation. La fenêtre de rapprochement,
// elle, est définie dans _shared/rapprochement.ts.
const JOURS_HISTORIQUE = 365;

const authHeaders = (token: string) => ({
  "Content-Type": "application/json",
  "Client-Id": BRIDGE_CLIENT_ID!,
  "Client-Secret": BRIDGE_CLIENT_SECRET!,
  "Bridge-Version": BRIDGE_VERSION,
  "Authorization": `Bearer ${token}`,
});

// Bridge pagine via pagination.next_uri (chemin relatif ou absolu).
async function fetchAll(path: string, token: string, max = 5000) {
  let url: string | null = `${BRIDGE_BASE}${path}`;
  const out: any[] = [];
  while (url && out.length < max) {
    const res = await fetch(url, { headers: authHeaders(token) });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        data.errors?.[0]?.message || data.message || data.error || "Appel Bridge en échec",
      );
    }
    const resources = data.resources || [];
    if (Array.isArray(resources)) out.push(...resources);
    const next = data.pagination?.next_uri;
    url = next ? (next.startsWith("http") ? next : `https://api.bridgeapi.io${next}`) : null;
  }
  return out;
}

// Rafraîchit le jeton utilisateur : celui stocké en base peut avoir expiré.
async function getUserToken(userUuid: string) {
  const res = await fetch(`${BRIDGE_BASE}/authorization/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Id": BRIDGE_CLIENT_ID!,
      "Client-Secret": BRIDGE_CLIENT_SECRET!,
      "Bridge-Version": BRIDGE_VERSION,
    },
    body: JSON.stringify({ user_uuid: userUuid }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.errors?.[0]?.message || data.message || "Impossible d'obtenir un jeton Bridge",
    );
  }
  return data.access_token || data.token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { societe_id } = await req.json();
    if (!societe_id) throw new Error("societe_id required");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: conn } = await supabase.from("bank_connections")
      .select("*").eq("societe_id", societe_id).single();
    if (!conn || conn.status !== "connected") throw new Error("Aucun compte bancaire connecté");
    if (!conn.bridge_user_uuid) throw new Error("Utilisateur Bridge manquant");

    const token = await getUserToken(conn.bridge_user_uuid);

    // ── 1. Comptes ────────────────────────────────────────
    const comptes = await fetchAll("/accounts?limit=200", token);

    for (const c of comptes) {
      await supabase.from("bank_accounts").upsert({
        societe_id,
        bridge_account_id: c.id,
        bridge_item_id: c.item_id ?? null,
        nom: c.name ?? null,
        iban: c.iban ?? null,
        type: c.type ?? null,
        devise: c.currency_code ?? "EUR",
        solde: c.balance ?? null,
        actif: c.paused !== true && c.data_access !== "disabled",
        derniere_maj: c.updated_at ?? null,
      }, { onConflict: "societe_id,bridge_account_id" });
    }

    // Correspondance id Bridge → id interne, pour rattacher les mouvements.
    const { data: comptesDb } = await supabase.from("bank_accounts")
      .select("id, bridge_account_id, devise, suivi").eq("societe_id", societe_id);
    const compteParBridgeId = new Map(
      (comptesDb || []).map((c) => [Number(c.bridge_account_id), c]),
    );

    // ── 2. Mouvements ─────────────────────────────────────
    const since = new Date(Date.now() - JOURS_HISTORIQUE * 86400000)
      .toISOString().slice(0, 10);
    const mouvements = await fetchAll(`/transactions?since=${since}&limit=500`, token);

    // Champs Bridge v3 : clean_description / provider_description.
    // L'ancienne implémentation lisait description / raw_description, qui
    // n'existent pas — les libellés étaient donc toujours vides.
    for (const t of mouvements) {
      const compte = compteParBridgeId.get(Number(t.account_id));
      await supabase.from("bank_transactions").upsert({
        societe_id,
        bank_account_id: compte?.id ?? null,
        bridge_transaction_id: t.id,
        bridge_account_id: t.account_id ?? null,
        date: t.date || t.booking_date || t.transaction_date,
        booking_date: t.booking_date ?? null,
        value_date: t.value_date ?? null,
        montant: t.amount ?? 0,
        devise: t.currency_code ?? "EUR",
        libelle: t.clean_description ?? t.provider_description ?? null,
        libelle_brut: t.provider_description ?? null,
        categorie_id: t.category_id ?? null,
        operation_type: t.operation_type ?? null,
        future: t.future === true,
        supprime: t.deleted === true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "societe_id,bridge_transaction_id",
        // Ne pas écraser un rapprochement déjà établi.
        ignoreDuplicates: false,
      });
    }

    // ── 3. Rapprochement ──────────────────────────────────
    // Délégué au moteur de scoring partagé (_shared/rapprochement.ts), qui
    // combine montant, fenêtre temporelle, libellé et nature d'opération,
    // puis affecte globalement les meilleurs couples. Les cas ambigus ne
    // sont pas tranchés : ils remontent en suggestions.
    const { data: baux } = await supabase.from("baux")
      .select("id, locataire_id").eq("societe_id", societe_id).eq("actif", true);

    let rapproches = 0;
    let suggeres = 0;

    if (baux && baux.length > 0) {
      const bailIds = baux.map((b) => b.id);

      const { data: echeances } = await supabase.from("transactions")
        .select("id, bail_id, mois, annee, montant_loyer, montant_charges")
        .in("bail_id", bailIds).in("statut", ["impayé", "en_attente"]);

      // Noms rattachés à chaque bail : servent au signal « libellé ».
      const { data: locataires } = await supabase.from("locataires")
        .select("id, raison_sociale, nom, prenom").eq("societe_id", societe_id);

      const contextes = new Map<string, ContexteBail>();
      for (const b of baux) {
        const loc = (locataires || []).find((l) => l.id === b.locataire_id);
        contextes.set(b.id, {
          bail_id: b.id,
          noms: [loc?.raison_sociale, loc?.nom, `${loc?.prenom ?? ""} ${loc?.nom ?? ""}`]
            .filter((x): x is string => !!x && x.trim().length > 0),
        });
      }

      // Crédits en euros, non annulés, sur un compte suivi, non rapprochés.
      const { data: credits } = await supabase.from("bank_transactions")
        .select("id, date, montant, libelle, libelle_brut, operation_type, bank_account_id")
        .eq("societe_id", societe_id)
        .eq("statut_rapprochement", "a_qualifier")
        .eq("supprime", false)
        .eq("devise", "EUR")
        .gt("montant", 0);

      const disponibles = (credits || []).filter((c) => {
        const compte = (comptesDb || []).find((x) => x.id === c.bank_account_id);
        return !compte || compte.suivi !== false;
      });

      // Émetteurs déjà rattachés à un bail lors de qualifications manuelles.
      const { data: apprisRows } = await supabase.from("rapprochement_appris")
        .select("empreinte, bail_id").eq("societe_id", societe_id);
      const appris = new Map<string, string>(
        (apprisRows || []).map((r) => [r.empreinte as string, r.bail_id as string]),
      );

      const { affectations, suggestions } = rapprocher(
        (echeances || []) as Echeance[],
        disponibles as Mouvement[],
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
          date_paiement: mvt?.date ?? new Date().toISOString().slice(0, 10),
        }).eq("id", a.echeance_id);

        rapproches++;
      }

      // Mémorise les pistes pour l'écran Banque, sans rien décider.
      for (const [mvtId, liste] of suggestions) {
        await supabase.from("bank_transactions")
          .update({ suggestions: liste, updated_at: new Date().toISOString() })
          .eq("id", mvtId);
        suggeres++;
      }
    }

    await supabase.from("bank_connections")
      .update({ last_sync: new Date().toISOString() })
      .eq("societe_id", societe_id);

    const { count: aQualifier } = await supabase.from("bank_transactions")
      .select("id", { count: "exact", head: true })
      .eq("societe_id", societe_id)
      .eq("statut_rapprochement", "a_qualifier")
      .gt("montant", 0);

    return new Response(JSON.stringify({
      comptes: comptes.length,
      mouvements: mouvements.length,
      rapproches,
      suggeres,
      a_qualifier: aQualifier ?? 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
