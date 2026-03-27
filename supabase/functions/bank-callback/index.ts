import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BRIDGE_CLIENT_ID = Deno.env.get("BRIDGE_CLIENT_ID");
const BRIDGE_CLIENT_SECRET = Deno.env.get("BRIDGE_CLIENT_SECRET");
const BRIDGE_VERSION = "2025-01-15";
const BRIDGE_BASE = "https://api.bridgeapi.io/v3/aggregation";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const authHeaders = (token: string) => ({
  "Content-Type": "application/json",
  "Client-Id": BRIDGE_CLIENT_ID!,
  "Client-Secret": BRIDGE_CLIENT_SECRET!,
  "Bridge-Version": BRIDGE_VERSION,
  "Authorization": `Bearer ${token}`,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { societe_id } = await req.json();
    if (!societe_id) throw new Error("societe_id required");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: conn } = await supabase.from("bank_connections")
      .select("*").eq("societe_id", societe_id).single();
    if (!conn?.bridge_user_token) throw new Error("No pending bank connection");

    const token = conn.bridge_user_token;

    // List accounts (if bank connection succeeded, accounts will be available)
    const accRes = await fetch(`${BRIDGE_BASE}/accounts`, {
      headers: authHeaders(token),
    });
    const accData = await accRes.json();
    if (!accRes.ok) throw new Error(accData.message || accData.error || JSON.stringify(accData));

    const accounts = accData.resources || accData || [];
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return new Response(JSON.stringify({
        status: "pending",
        message: "Aucun compte bancaire détecté. Avez-vous terminé l'autorisation bancaire ?",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Pick checking account or first account
    const mainAccount = accounts.find((a: any) => a.type === "checking") || accounts[0];

    // Update DB
    await supabase.from("bank_connections").update({
      account_id: String(mainAccount.id),
      institution_name: mainAccount.bank_name || mainAccount.name || "Banque connectée",
      status: "connected",
    }).eq("societe_id", societe_id);

    return new Response(JSON.stringify({
      status: "connected",
      institution_name: mainAccount.bank_name || mainAccount.name || "",
      account_name: mainAccount.name || "",
      iban: mainAccount.iban || "",
      balance: mainAccount.balance,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
