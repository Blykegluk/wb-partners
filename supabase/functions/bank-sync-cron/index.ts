// Déclencheur de synchronisation bancaire pour le cron quotidien.
//
// Raison d'être : bank-sync exige un JWT Supabase valide, qu'un planificateur
// SQL ne peut pas produire sans détenir la clé de service. Plutôt que de
// stocker cette clé maîtresse dans le vault — elle donne un accès total à la
// base — le cron présente ici un jeton dédié qui ne sait faire qu'une chose :
// déclencher une synchronisation.
//
// La clé de service reste dans l'environnement des Edge Functions et ne
// circule jamais ailleurs.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_TOKEN");

// Comparaison à temps constant.
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Sans jeton configuré, la fonction reste fermée : mieux vaut ne rien
  // synchroniser que d'exposer un déclencheur libre.
  if (!CRON_TOKEN) {
    return new Response(JSON.stringify({ error: "CRON_TOKEN non configuré" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const fourni = req.headers.get("x-cron-token") || "";
  if (!egalConstant(CRON_TOKEN, fourni)) {
    return new Response(JSON.stringify({ error: "Jeton invalide" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: connexions } = await supabase.from("bank_connections")
      .select("societe_id").eq("status", "connected");

    const societes = (connexions || []).map((c) => c.societe_id as string);

    // pg_net abandonne au bout de 5 s, alors qu'une synchronisation demande
    // une quinzaine de secondes par société. On répond donc immédiatement et
    // on poursuit le travail en arrière-plan : EdgeRuntime.waitUntil() garde
    // la fonction vivante après l'envoi de la réponse.
    const travail = (async () => {
      for (const societeId of societes) {
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/bank-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
            body: JSON.stringify({ societe_id: societeId }),
          });
          const data = await res.json();
          console.log(`[cron] ${societeId}`, res.status, JSON.stringify(data));
        } catch (err) {
          // Une société en échec ne doit pas empêcher les suivantes.
          console.error(`[cron] ${societeId} en échec :`, err);
        }
      }
    })();

    // @ts-ignore — EdgeRuntime est fourni par le runtime Supabase.
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(travail);
    } else {
      await travail;
    }

    return new Response(
      JSON.stringify({ accepte: true, societes: societes.length }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
