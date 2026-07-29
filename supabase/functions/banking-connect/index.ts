// Ouvre un consentement bancaire et renvoie l'URL de la banque.
// Appelée depuis Paramètres → Banque, avec le jeton de l'utilisateur.

import { corsHeaders } from "../_shared/cors.ts";
import { startAuthorization } from "../_shared/enablebanking.ts";
import { adminClient } from "../_shared/banking-store.ts";

const REDIRECT_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/banking-callback`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { aspsp_name, aspsp_country, societe_id } = await req.json();
    if (!aspsp_name || !aspsp_country) {
      throw new Error("aspsp_name et aspsp_country sont requis");
    }

    const supabase = adminClient();

    // `state` protège du CSRF : on le retrouvera au retour de la banque et on
    // vérifiera qu'il correspond bien à une demande que nous avons émise.
    const state = crypto.randomUUID();

    const { error } = await supabase.from("bank_authorizations").insert({
      state,
      aspsp_name,
      aspsp_country,
      societe_id: societe_id ?? null,
      status: "pending",
    });
    if (error) throw new Error(`Enregistrement de la demande : ${error.message}`);

    const auth = await startAuthorization({
      aspspName: aspsp_name,
      aspspCountry: aspsp_country,
      redirectUrl: REDIRECT_URL,
      state,
    });

    return new Response(
      JSON.stringify({ url: auth.url, authorization_id: auth.authorization_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[banking-connect]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
