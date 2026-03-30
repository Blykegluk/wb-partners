import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_id, email } = await req.json();
    if (!user_id || !email) throw new Error("user_id and email required");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Find pending invitations for this email
    const { data: invites } = await supabase.from("invitations")
      .select("*").eq("email", email.toLowerCase());

    if (!invites || invites.length === 0) {
      return new Response(JSON.stringify({ accepted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accepted = 0;
    for (const inv of invites) {
      // Add as member (service_role bypasses RLS)
      const { error } = await supabase.from("societe_membres").upsert(
        { societe_id: inv.societe_id, user_id, role: inv.role },
        { onConflict: "societe_id,user_id" }
      );
      if (!error) {
        await supabase.from("invitations").delete().eq("id", inv.id);
        accepted++;
      }
    }

    return new Response(JSON.stringify({ accepted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
