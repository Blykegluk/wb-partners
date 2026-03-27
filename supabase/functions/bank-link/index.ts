import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GC_SECRET_ID = Deno.env.get("GOCARDLESS_SECRET_ID");
const GC_SECRET_KEY = Deno.env.get("GOCARDLESS_SECRET_KEY");
const GC_BASE = "https://bankaccountdata.gocardless.com/api/v2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getGCToken(): Promise<string> {
  const res = await fetch(`${GC_BASE}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret_id: GC_SECRET_ID, secret_key: GC_SECRET_KEY }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "GoCardless auth failed");
  return data.access;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!GC_SECRET_ID || !GC_SECRET_KEY) throw new Error("GoCardless credentials not configured");

    const { societe_id, institution_id, redirect_url } = await req.json();
    if (!societe_id || !institution_id || !redirect_url) throw new Error("societe_id, institution_id, redirect_url required");

    const token = await getGCToken();
    const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };

    // 1. Create end-user agreement (90 days access, 90 days history)
    const agrRes = await fetch(`${GC_BASE}/agreements/enduser/`, {
      method: "POST", headers,
      body: JSON.stringify({
        institution_id,
        max_historical_days: 90,
        access_valid_for_days: 90,
        access_scope: ["balances", "transactions"],
      }),
    });
    const agreement = await agrRes.json();
    if (!agrRes.ok) throw new Error(agreement.detail || JSON.stringify(agreement));

    // 2. Create requisition (link session)
    const reqRes = await fetch(`${GC_BASE}/requisitions/`, {
      method: "POST", headers,
      body: JSON.stringify({
        redirect: redirect_url,
        institution_id,
        agreement: agreement.id,
        user_language: "FR",
      }),
    });
    const requisition = await reqRes.json();
    if (!reqRes.ok) throw new Error(requisition.detail || JSON.stringify(requisition));

    // 3. Store in DB
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    await supabase.from("bank_connections").upsert({
      societe_id,
      requisition_id: requisition.id,
      agreement_id: agreement.id,
      institution_id,
      status: "pending",
    }, { onConflict: "societe_id" });

    // 4. Return the bank authorization URL
    return new Response(JSON.stringify({ link: requisition.link, requisition_id: requisition.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
