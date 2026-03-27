import { corsHeaders } from "../_shared/cors.ts";

const RESEND_KEY = Deno.env.get("RESEND_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_KEY) throw new Error("RESEND_KEY not configured");

    const { email, societe_name, invited_by_name, role } = await req.json();
    if (!email) throw new Error("email is required");

    const roleLabel = { admin: "Administrateur", editor: "Éditeur", viewer: "Lecteur" }[role] || "Lecteur";
    const appUrl = "https://blykegluk.github.io/wb-partners/";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: "WB Partners <noreply@wbpartners.fr>",
        to: [email],
        subject: `${invited_by_name || "Un collaborateur"} vous invite sur WB Partners`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
            <h1 style="color: #1e293b; font-size: 20px; margin-bottom: 8px;">WB Partners</h1>
            <p style="color: #94a3b8; font-size: 13px; margin-bottom: 32px;">Gestion Immobilière</p>

            <p style="color: #334155; font-size: 15px; line-height: 1.6;">
              <strong>${invited_by_name || "Un collaborateur"}</strong> vous invite à rejoindre la société
              <strong>${societe_name || "—"}</strong> en tant que <strong>${roleLabel}</strong>.
            </p>

            <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 24px;">
              Connectez-vous avec votre compte Google pour accéder à l'espace de gestion :
            </p>

            <a href="${appUrl}"
               style="display: inline-block; background: #1e293b; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 16px;">
              Rejoindre WB Partners
            </a>

            <p style="color: #94a3b8; font-size: 12px; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              Si vous ne connaissez pas l'expéditeur, vous pouvez ignorer cet email.
            </p>
          </div>
        `,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Erreur envoi email");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
