// Récupère les mouvements bancaires puis rapproche les loyers.
//
// Deux usages :
//   - bouton « Synchroniser » de l'écran Banque (jeton de l'utilisateur)
//   - cron quotidien via bank-sync-cron (jeton de service)
//
// Sans societe_id, toutes les sociétés ayant au moins un compte connecté sont
// traitées — c'est le mode utilisé par le cron.

import { corsHeaders } from "../_shared/cors.ts";
import { adminClient, synchroniserSociete } from "../_shared/banking-store.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = adminClient();

    let societes: string[];
    if (body.societe_id) {
      societes = [body.societe_id];
    } else {
      const { data } = await supabase.from("bank_accounts")
        .select("societe_id").not("societe_id", "is", null);
      societes = [...new Set((data ?? []).map((r) => r.societe_id as string))];
    }

    if (societes.length === 0) {
      return new Response(
        JSON.stringify({ error: "Aucun compte bancaire connecté" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Une société en échec ne doit pas empêcher les suivantes.
    const resultats = [];
    for (const societeId of societes) {
      try {
        const r = await synchroniserSociete(supabase, societeId);
        resultats.push({ societe_id: societeId, ok: true, ...r });
        console.log(`[banking-sync] ${societeId}`, JSON.stringify(r));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        resultats.push({ societe_id: societeId, ok: false, error: message });
        console.error(`[banking-sync] ${societeId} en échec :`, message);
      }
    }

    // Appel mono-société : on renvoie le résultat à plat, l'écran Banque
    // l'affiche directement.
    if (societes.length === 1) {
      const r = resultats[0];
      const status = r.ok ? 200 : 400;
      return new Response(JSON.stringify(r), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ societes: resultats.length, resultats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[banking-sync]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
