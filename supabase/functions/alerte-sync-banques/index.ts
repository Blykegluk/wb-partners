// Alerte — la synchronisation bancaire quotidienne n'a pas abouti.
//
// Appelée par pg_cron une heure après `sync-banques-quotidien`. Le signal
// retenu n'est PAS le code de retour de la synchronisation : un appel peut
// répondre 200 sans avoir rafraîchi quoi que ce soit, et pg_net écrit sa
// réponse de façon asynchrone. On regarde donc l'effet, seul fait observable
// — la fraîcheur de `bank_accounts.derniere_sync` — ce qui couvre d'un même
// geste l'erreur applicative, le dépassement de délai, la fonction en panne
// et le consentement DSP2 expiré.
//
// Silencieuse quand tout va bien : pas de mail « tout est normal ».

import { createClient } from "npm:@supabase/supabase-js@2";

// En-têtes CORS recopiés plutôt qu'importés de `_shared` : cette fonction est
// déployée sans la CLI, et le bundler ne remonte alors pas au-dessus du
// dossier de la fonction. Recopier cinq lignes garde le déployé identique au
// versionné, ce qui vaut mieux que de partager un module au prix d'un écart.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_KEY = Deno.env.get("RESEND_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EXPEDITEUR = "WB Partners <contact@wbpartners.fr>";
// La synchronisation tourne à 06:00 UTC et l'alerte à 07:00 : une synchro
// réussie a moins d'une heure, une synchro manquée en a plus de vingt-quatre.
// Le seuil à 20 h ne peut donc pas se tromper de camp. Il se règle depuis
// `veille_config.alerte_sync_seuil_heures` — utile pour éprouver la chaîne
// d'envoi sans attendre une vraie panne, en l'abaissant le temps d'un appel.
const SEUIL_DEFAUT = 20;

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })
    : "jamais";

const joursDepuis = (iso: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;

function corps(comptes: any[]): string {
  const lignes = comptes.map((c) => {
    const j = joursDepuis(c.derniere_sync);
    const anciennete = j === null
      ? "aucune synchronisation enregistrée"
      : j === 0
      ? "dernière synchronisation aujourd'hui"
      : `${j} jour${j > 1 ? "s" : ""} sans synchronisation`;
    const consentement = c.session_status === "active"
      ? "consentement valide"
      : `consentement ${c.session_status ?? "inconnu"}`;
    return `<tr>
      <td style="padding:6px 12px 6px 0;font-weight:600">${c.name ?? c.iban ?? "Compte"}</td>
      <td style="padding:6px 12px 6px 0;color:#475569">${c.societe ?? "—"}</td>
      <td style="padding:6px 12px 6px 0;color:#475569">${fmtDate(c.derniere_sync)}</td>
      <td style="padding:6px 0;color:#475569">${anciennete} · ${consentement}</td>
    </tr>`;
  }).join("");

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f1d3a;max-width:640px">
    <h2 style="margin:0 0 4px">Synchronisation bancaire en échec</h2>
    <p style="margin:0 0 16px;color:#475569">
      ${comptes.length} compte${comptes.length > 1 ? "s n'ont" : " n'a"} pas été rafraîchi${comptes.length > 1 ? "s" : ""}
      lors du passage de ce matin.
    </p>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:16px">${lignes}</table>
    <p style="margin:0 0 12px;color:#475569;font-size:14px">
      Tant que la synchronisation ne repart pas, les soldes et les mouvements affichés dans
      l'application restent figés à leur dernière valeur connue. Les loyers encaissés depuis
      ne sont donc pas rapprochés, et <strong>les relances automatiques peuvent partir à tort</strong>
      sur des échéances en réalité payées.
    </p>
    <p style="margin:0;color:#475569;font-size:14px">
      Si le consentement est expiré, il se rouvre depuis Paramètres → Banque.
      Le consentement DSP2 est plafonné à 90 jours.
    </p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (p: unknown, status = 200) =>
    new Response(JSON.stringify(p), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Même garde que auto-documents : le cron ne détient pas la clé de
    // service, seulement un jeton relu du vault par un RPC security definer.
    const jeton = req.headers.get("x-cron-token");
    const { data: attendu } = await supabase.rpc("jeton_cron_alertes");
    if (!jeton || !attendu || jeton !== attendu) {
      return json({ error: "jeton cron invalide" }, 401);
    }

    const { data: cfgSeuil } = await supabase
      .from("veille_config").select("contenu").eq("cle", "alerte_sync_seuil_heures").maybeSingle();
    const seuil = Number(cfgSeuil?.contenu);
    const seuilHeures = Number.isFinite(seuil) && seuil >= 0 ? seuil : SEUIL_DEFAUT;

    const limite = new Date(Date.now() - seuilHeures * 3600 * 1000).toISOString();
    const { data: comptes, error } = await supabase
      .from("bank_accounts")
      .select("name, iban, derniere_sync, session_status, suivi, societe:societe_id(nom, nom_affiche)")
      .eq("suivi", true);
    if (error) throw new Error(`Lecture des comptes : ${error.message}`);

    const enRetard = (comptes ?? [])
      .filter((c: any) =>
        !c.derniere_sync || c.derniere_sync < limite || c.session_status !== "active"
      )
      .map((c: any) => ({
        ...c,
        societe: c.societe?.nom_affiche || c.societe?.nom || null,
      }));

    if (enRetard.length === 0) return json({ ok: true, alerte: false, comptes: comptes?.length ?? 0, seuilHeures });

    const { data: cfg } = await supabase
      .from("veille_config").select("contenu").eq("cle", "alerte_sync_email").maybeSingle();
    const destinataires = String(cfg?.contenu ?? "")
      .split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));

    if (destinataires.length === 0) {
      console.warn("[alerte-sync-banques] aucun destinataire dans veille_config.alerte_sync_email");
      return json({ ok: false, alerte: true, envoye: false, motif: "aucun destinataire configuré" });
    }
    if (!RESEND_KEY) return json({ ok: false, alerte: true, envoye: false, motif: "RESEND_KEY absente" });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: EXPEDITEUR,
        to: destinataires,
        subject: `⚠️ Synchronisation bancaire en échec — ${enRetard.length} compte${enRetard.length > 1 ? "s" : ""}`,
        html: corps(enRetard),
      }),
    });
    const reponse = await res.json();
    if (!res.ok) throw new Error(`Resend ${res.status} : ${JSON.stringify(reponse)}`);

    console.log(`[alerte-sync-banques] ${enRetard.length} compte(s) en retard, mail envoyé à ${destinataires.join(", ")}`);
    return json({ ok: true, alerte: true, envoye: true, comptes: enRetard.length, destinataires, seuilHeures });
  } catch (e) {
    console.error("[alerte-sync-banques]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
