// Ouvre un consentement bancaire et renvoie l'URL de la banque.
// Appelée depuis Paramètres → Banque, avec le jeton de l'utilisateur.
//
// Sert aussi la liste des banques ({ action: "aspsps" }) : les noms attendus
// par Enable Banking doivent être exacts au caractère près, on ne les recopie
// donc nulle part.

import { corsHeaders } from "../_shared/cors.ts";
import { getAspsps, startAuthorization } from "../_shared/enablebanking.ts";
import { adminClient } from "../_shared/banking-store.ts";

const REDIRECT_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/banking-callback`;
const PAYS = "FR";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));

    if (body.action === "aspsps") {
      const aspsps = await getAspsps(PAYS);
      return json({
        aspsps: aspsps
          .map((a) => ({ name: a.name, psu_types: a.psu_types ?? [] }))
          .sort((a, b) => a.name.localeCompare(b.name, "fr")),
      });
    }

    const { aspsp_name, societe_id, psu_type } = body;
    if (!aspsp_name) throw new Error("aspsp_name est requis");

    // On valide le nom avant d'ouvrir le consentement : l'API répondrait sinon
    // « Wrong ASPSP name provided », sans dire lequel elle attendait.
    const banque = (await getAspsps(PAYS)).find((a) => a.name === aspsp_name);
    if (!banque) {
      throw new Error(
        `Banque « ${aspsp_name} » absente de la liste Enable Banking pour la France. ` +
          "Le nom doit être repris exactement, accents compris.",
      );
    }

    // Le type d'utilisateur conditionne le parcours d'authentification : une
    // banque professionnelle refuse un consentement ouvert en « personal ».
    const supportes = banque.psu_types ?? [];
    const type = psu_type && supportes.includes(psu_type)
      ? psu_type
      : supportes.includes("business")
      ? "business"
      : "personal";

    const supabase = adminClient();

    // `state` protège du CSRF : on le retrouvera au retour de la banque et on
    // vérifiera qu'il correspond bien à une demande que nous avons émise.
    const state = crypto.randomUUID();

    const { error } = await supabase.from("bank_authorizations").insert({
      state,
      aspsp_name,
      aspsp_country: PAYS,
      societe_id: societe_id ?? null,
      status: "pending",
    });
    if (error) throw new Error(`Enregistrement de la demande : ${error.message}`);

    const auth = await startAuthorization({
      aspspName: aspsp_name,
      aspspCountry: PAYS,
      redirectUrl: REDIRECT_URL,
      state,
      psuType: type,
    });

    return json({ url: auth.url, authorization_id: auth.authorization_id });
  } catch (error) {
    console.error("[banking-connect]", error);
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      400,
    );
  }
});
