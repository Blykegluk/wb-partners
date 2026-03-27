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
  if (!res.ok) throw new Error("GoCardless auth failed");
  return data.access;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { requisition_id } = await req.json();
    if (!requisition_id) throw new Error("requisition_id required");

    const token = await getGCToken();

    // Get requisition status and linked accounts
    const res = await fetch(`${GC_BASE}/requisitions/${requisition_id}/`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const requisition = await res.json();
    if (!res.ok) throw new Error(requisition.detail || "Failed to get requisition");

    if (requisition.status !== "LN") {
      return new Response(JSON.stringify({ status: requisition.status, message: "Connexion en attente d'autorisation" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountId = requisition.accounts?.[0];
    if (!accountId) throw new Error("Aucun compte bancaire trouvé");

    // Get account details
    const accRes = await fetch(`${GC_BASE}/accounts/${accountId}/`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const account = await accRes.json();

    // Get institution name
    let institutionName = "";
    try {
      const instRes = await fetch(`${GC_BASE}/institutions/${requisition.institution_id}/`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const inst = await instRes.json();
      institutionName = inst.name || "";
    } catch { /* ignore */ }

    // Update DB
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    await supabase.from("bank_connections").update({
      account_id: accountId,
      institution_name: institutionName || requisition.institution_id,
      status: "connected",
    }).eq("requisition_id", requisition_id);

    return new Response(JSON.stringify({
      status: "connected",
      account_id: accountId,
      institution_name: institutionName,
      iban: account.iban || "",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
