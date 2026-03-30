import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!RESEND_KEY) throw new Error("RESEND_KEY not configured");

    const { email, societe_id, societe_name, invited_by_name, invited_by_id, role } = await req.json();
    if (!email || !societe_id) throw new Error("email and societe_id required");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const trimmedEmail = email.trim().toLowerCase();

    // Check if user already exists in profiles (using service role = no RLS)
    const { data: profiles } = await supabase.from("profiles").select("id, email").eq("email", trimmedEmail);

    if (profiles && profiles.length > 0) {
      // User exists → add directly as member
      const target = profiles[0];

      // Check if already member
      const { data: existing } = await supabase.from("societe_membres")
        .select("id").eq("societe_id", societe_id).eq("user_id", target.id).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ success: true, action: "already_member" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase.from("societe_membres").insert({
        societe_id, user_id: target.id, role: role || "viewer",
      });
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ success: true, action: "added_directly" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User doesn't exist → store invitation
    const { error: invErr } = await supabase.from("invitations").upsert({
      societe_id, email: trimmedEmail, role: role || "viewer", invited_by: invited_by_id || null,
    }, { onConflict: "societe_id,email" });
    if (invErr) throw new Error(invErr.message);

    // Send invitation email
    const roleLabel: Record<string, string> = { admin: "Administrateur", editor: "Éditeur", viewer: "Lecteur" };
    const appUrl = "https://wbpartners.fr/app/";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: "WB Partners <contact@wbpartners.fr>",
        to: [trimmedEmail],
        subject: `${invited_by_name || "Un collaborateur"} vous invite sur WB Partners`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 32px;">
              <img src="https://wbpartners.fr/logo.png" alt="WB Partners" width="64" height="64" style="border-radius: 12px; margin-bottom: 12px;" />
              <h1 style="color: #1e293b; font-size: 20px; margin: 0;">WB Partners</h1>
              <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0;">Gestion Immobilière</p>
            </div>
            <p style="color: #334155; font-size: 15px; line-height: 1.6;">
              <strong>${invited_by_name || "Un collaborateur"}</strong> vous invite à rejoindre la société
              <strong>${societe_name || "—"}</strong> en tant que <strong>${roleLabel[role] || "Lecteur"}</strong>.
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

    return new Response(JSON.stringify({ success: true, action: "invited" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
