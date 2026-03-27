import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BRIDGE_CLIENT_ID = Deno.env.get("BRIDGE_CLIENT_ID");
const BRIDGE_CLIENT_SECRET = Deno.env.get("BRIDGE_CLIENT_SECRET");
const BRIDGE_VERSION = "2025-01-15";
const BRIDGE_BASE = "https://api.bridgeapi.io/v3";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const bridgeHeaders = (token?: string) => {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Client-Id": BRIDGE_CLIENT_ID!,
    "Client-Secret": BRIDGE_CLIENT_SECRET!,
    "Bridge-Version": BRIDGE_VERSION,
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
};

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

    // List connected items (bank connections)
    const itemsRes = await fetch(`${BRIDGE_BASE}/items`, {
      headers: bridgeHeaders(token),
    });
    const itemsData = await itemsRes.json();
    if (!itemsRes.ok) throw new Error(itemsData.message || "Failed to get items");

    const items = itemsData.resources || [];
    if (items.length === 0) {
      return new Response(JSON.stringify({ status: "pending", message: "Aucune connexion bancaire détectée. Avez-vous terminé l'autorisation ?" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const item = items[0]; // First connected bank

    // List accounts for this item
    const accRes = await fetch(`${BRIDGE_BASE}/accounts?item_id=${item.id}`, {
      headers: bridgeHeaders(token),
    });
    const accData = await accRes.json();
    const accounts = accData.resources || [];
    const mainAccount = accounts.find((a: any) => a.type === "checking") || accounts[0];

    // Get bank name
    let bankName = "";
    try {
      const bankRes = await fetch(`${BRIDGE_BASE}/banks/${item.bank_id}`, {
        headers: bridgeHeaders(),
      });
      const bank = await bankRes.json();
      bankName = bank.name || "";
    } catch { /* ignore */ }

    // Update DB
    await supabase.from("bank_connections").update({
      account_id: mainAccount?.id?.toString() || "",
      item_id: item.id?.toString() || "",
      institution_name: bankName || `Banque #${item.bank_id}`,
      status: "connected",
    }).eq("societe_id", societe_id);

    return new Response(JSON.stringify({
      status: "connected",
      institution_name: bankName,
      account_name: mainAccount?.name || "",
      iban: mainAccount?.iban || "",
      balance: mainAccount?.balance,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
