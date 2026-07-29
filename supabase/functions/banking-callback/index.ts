// Retour de la banque après consentement.
//
// C'est le NAVIGATEUR de l'utilisateur qui appelle cette fonction, sans
// en-tête Authorization : la vérification JWT doit donc être désactivée
// (verify_jwt = false dans supabase/config.toml, et dans les réglages de la
// fonction côté dashboard). Sans cela, Supabase répond 401 avant même
// d'exécuter le code et le parcours casse en silence.
//
// Toutes les sorties sont des redirections 302 : au bout du fil il y a un
// navigateur, pas un client d'API.

import { createSession } from "../_shared/enablebanking.ts";
import { adminClient, persisterSession } from "../_shared/banking-store.ts";

const RETOUR = "https://wbpartners.fr/app/banques";

function redirige(params: Record<string, string>): Response {
  const url = new URL(RETOUR);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const erreur = url.searchParams.get("error");
  const description = url.searchParams.get("error_description");

  const supabase = adminClient();

  try {
    // La banque signale un refus ou un abandon.
    if (erreur) {
      console.warn(`[banking-callback] refus de la banque : ${erreur} — ${description ?? ""}`);
      if (state) {
        await supabase.from("bank_authorizations")
          .update({ status: "failed" }).eq("state", state);
      }
      return redirige({ error: description || erreur });
    }

    if (!code || !state) {
      console.warn("[banking-callback] code ou state absent");
      return redirige({ error: "Réponse incomplète de la banque" });
    }

    // Protection CSRF : le state doit correspondre à une demande que nous
    // avons émise et qui n'a pas déjà été consommée.
    const { data: demande } = await supabase.from("bank_authorizations")
      .select("id, societe_id, status").eq("state", state).maybeSingle();

    if (!demande || demande.status !== "pending") {
      console.warn(`[banking-callback] state inconnu ou déjà utilisé : ${state}`);
      return redirige({ error: "Demande de connexion invalide ou expirée" });
    }

    // POST /sessions ne renvoie qu'UNE FOIS la liste complète des comptes :
    // on persiste tout immédiatement, payload brut compris.
    const session = await createSession(code);
    const { comptes } = await persisterSession(
      supabase,
      session,
      demande.societe_id as string | null,
    );

    await supabase.from("bank_authorizations")
      .update({ status: "completed" }).eq("state", state);

    console.log(`[banking-callback] session ${session.session_id} — ${comptes} compte(s)`);
    return redirige({ connected: "1" });
  } catch (error) {
    console.error("[banking-callback]", error);
    if (state) {
      await supabase.from("bank_authorizations")
        .update({ status: "failed" }).eq("state", state).then(() => {}, () => {});
    }
    return redirige({
      error: error instanceof Error ? error.message : "Connexion impossible",
    });
  }
});
