// Reçoit les webhooks Bridge (Agrégation) et déclenche les actions attendues
// côté WB Partners : mise à jour du statut de connexion, sync des transactions.
//
// Événements gérés :
//   - TEST_EVENT              : simple accusé de réception (test depuis le dashboard Bridge)
//   - item.created            : nouvelle connexion établie → passe la bank_connections en "connected"
//   - item.refreshed          : item rafraîchi → déclenche un sync des transactions
//   - item.account.updated    : nouvelles transactions dispo → déclenche un sync
//   - item.deleted            : item supprimé côté Bridge → marque la connexion comme "deleted"
//   - user.deleted            : user supprimé côté Bridge → marque toutes ses connexions
//
// Répond TOUJOURS 200 pour éviter que Bridge retente : les erreurs internes
// sont loguées mais le webhook n'est jamais considéré "en échec".

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Optionnel : si Bridge signe les webhooks, on peut vérifier la signature HMAC.
// Non bloquant pour l'instant — la vérif sera activée quand le secret sera
// configuré côté Bridge et injecté ici.
const BRIDGE_WEBHOOK_SECRET = Deno.env.get("BRIDGE_WEBHOOK_SECRET");

async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!BRIDGE_WEBHOOK_SECRET) return true; // pas de secret configuré → skip
  if (!header) return false;
  // Bridge envoie "v1=<hex(hmac_sha256(rawBody, secret))>"
  const parts = header.split(",").map((p) => p.trim().split("="));
  const v1 = parts.find(([k]) => k === "v1")?.[1];
  if (!v1) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(BRIDGE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Comparaison à temps constant
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("BridgeApi-Signature");

    if (!(await verifySignature(rawBody, signatureHeader))) {
      console.warn("[Bridge webhook] invalid signature, event rejected");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.warn("[Bridge webhook] non-JSON body:", rawBody.slice(0, 200));
    }

    const type = String(payload.type || "");
    const content = (payload.content as Record<string, unknown>) || {};
    const itemId = content.item_id ? String(content.item_id) : null;
    const userUuid = content.user_uuid ? String(content.user_uuid) : null;

    console.log(`[Bridge webhook] type=${type} item_id=${itemId} user_uuid=${userUuid}`);

    // TEST_EVENT : simple ping du dashboard Bridge — pas d'action à faire.
    if (!type || type === "TEST_EVENT") {
      return new Response(JSON.stringify({ received: true, test: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Retrouve la société liée à l'utilisateur Bridge.
    let societeId: string | null = null;
    if (userUuid) {
      const { data } = await supabase.from("bank_connections")
        .select("societe_id").eq("bridge_user_uuid", userUuid).maybeSingle();
      societeId = (data?.societe_id as string) ?? null;
    }

    if (type === "item.created" && societeId) {
      await supabase.from("bank_connections")
        .update({ status: "connected", item_id: itemId })
        .eq("societe_id", societeId);
    } else if (
      (type === "item.refreshed" || type === "item.account.updated") &&
      societeId
    ) {
      // Déclenche bank-sync sans attendre la réponse (fire-and-forget).
      // Bridge attend un 200 rapide ; le sync peut prendre plusieurs secondes.
      fetch(`${SUPABASE_URL}/functions/v1/bank-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ societe_id: societeId }),
      }).catch((err) => console.error("[Bridge webhook] bank-sync trigger failed:", err));
    } else if ((type === "item.deleted" || type === "user.deleted") && societeId) {
      await supabase.from("bank_connections")
        .update({ status: "deleted" })
        .eq("societe_id", societeId);
    }

    return new Response(JSON.stringify({ received: true, type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    // On répond 200 pour éviter les retries Bridge, mais on log.
    console.error("[Bridge webhook] error:", error);
    return new Response(
      JSON.stringify({ received: true, error: String(error?.message || error) }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
