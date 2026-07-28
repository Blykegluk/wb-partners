import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BRIDGE_CLIENT_ID = Deno.env.get("BRIDGE_CLIENT_ID");
const BRIDGE_CLIENT_SECRET = Deno.env.get("BRIDGE_CLIENT_SECRET");
const BRIDGE_VERSION = "2025-01-15";
const BRIDGE_BASE = "https://api.bridgeapi.io/v3/aggregation";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Historique récupéré à chaque synchronisation.
const JOURS_HISTORIQUE = 365;
// Fenêtre de rapprochement : un loyer peut être payé en avance ou en retard.
const JOURS_AVANT = 10;
const JOURS_APRES = 120;

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
    // Règles volontairement prudentes : un rapprochement automatique erroné
    // couperait une relance légitime. Les cas douteux restent « à qualifier ».
    const { data: baux } = await supabase.from("baux")
      .select("id, loyer_ht, charges").eq("societe_id", societe_id).eq("actif", true);

    let rapproches = 0;

    if (baux && baux.length > 0) {
      const bailIds = baux.map((b) => b.id);
      const { data: echeances } = await supabase.from("transactions")
        .select("*").in("bail_id", bailIds).in("statut", ["impayé", "en_attente"]);

      // Crédits en euros, non annulés, sur un compte suivi, pas déjà rapprochés.
      const { data: credits } = await supabase.from("bank_transactions")
        .select("*")
        .eq("societe_id", societe_id)
        .eq("statut_rapprochement", "a_qualifier")
        .eq("supprime", false)
        .eq("devise", "EUR")
        .gt("montant", 0);

      const disponibles = (credits || []).filter((c) => {
        const compte = (comptesDb || []).find((x) => x.id === c.bank_account_id);
        return !compte || compte.suivi !== false;
      });

      const utilises = new Set<string>();

      for (const ech of echeances || []) {
        const attendu = Number(ech.montant_loyer || 0) + Number(ech.montant_charges || 0);
        const loyerSeul = Number(ech.montant_loyer || 0);
        if (attendu <= 0) continue;

        // Échéance due le 1er du mois concerné.
        const echeanceDue = new Date(Date.UTC(ech.annee, ech.mois, 1));
        const debut = new Date(echeanceDue.getTime() - JOURS_AVANT * 86400000);
        const fin = new Date(echeanceDue.getTime() + JOURS_APRES * 86400000);

        const candidat = disponibles.find((c) => {
          if (utilises.has(c.id)) return false;
          const d = new Date(c.date);
          // Fenêtre glissante : corrige le défaut de la version précédente,
          // qui exigeait que le virement tombe dans le mois de l'échéance et
          // ne rapprochait donc jamais un paiement en retard.
          if (d < debut || d > fin) return false;
          const m = Number(c.montant);
          const tol = Math.max(attendu * 0.02, 2);
          return Math.abs(m - attendu) <= tol || Math.abs(m - loyerSeul) <= tol;
        });

        if (!candidat) continue;

        utilises.add(candidat.id);

        await supabase.from("bank_transactions").update({
          statut_rapprochement: "rapproche_auto",
          transaction_id: ech.id,
          score_confiance: 0.8,
          rapproche_le: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", candidat.id);

        await supabase.from("transactions").update({
          statut: "payé",
          date_paiement: candidat.date,
        }).eq("id", ech.id);

        rapproches++;
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
      a_qualifier: aQualifier ?? 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
