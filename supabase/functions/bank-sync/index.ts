import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BRIDGE_CLIENT_ID = Deno.env.get("BRIDGE_CLIENT_ID");
const BRIDGE_CLIENT_SECRET = Deno.env.get("BRIDGE_CLIENT_SECRET");
const BRIDGE_VERSION = "2025-01-15";
const BRIDGE_BASE = "https://api.bridgeapi.io/v3";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const bridgeHeaders = (token: string) => ({
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

    // Get bank connection
    const { data: conn } = await supabase.from("bank_connections")
      .select("*").eq("societe_id", societe_id).single();
    if (!conn || conn.status !== "connected") throw new Error("Aucun compte bancaire connecté");
    if (!conn.bridge_user_token) throw new Error("Token Bridge manquant");

    const token = conn.bridge_user_token;

    // Fetch transactions from last 90 days
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let allBankTx: any[] = [];
    let nextUri: string | null = `/v3/transactions?since=${since}&limit=500`;

    // Paginate through all transactions
    while (nextUri) {
      const url = nextUri.startsWith("http") ? nextUri : `${BRIDGE_BASE}${nextUri.replace('/v3', '')}`;
      const res = await fetch(url.startsWith("http") ? url : `${BRIDGE_BASE}${nextUri}`, {
        headers: bridgeHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch transactions");

      allBankTx = allBankTx.concat(data.resources || []);
      nextUri = data.pagination?.next_uri || null;

      // Safety: max 2000 transactions
      if (allBankTx.length > 2000) break;
    }

    // Only keep credits (positive amounts = incoming money = rent payments)
    const credits = allBankTx.filter(t => t.amount > 0);

    // Get all active baux for this société
    const { data: baux } = await supabase.from("baux").select("id, loyer_ht, charges")
      .eq("societe_id", societe_id).eq("actif", true);
    if (!baux || baux.length === 0) {
      await supabase.from("bank_connections").update({ last_sync: new Date().toISOString() }).eq("societe_id", societe_id);
      return new Response(JSON.stringify({ matched: 0, bank_transactions: allBankTx.length, credits: credits.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get pending/unpaid transactions
    const bailIds = baux.map(b => b.id);
    const { data: pendingTx } = await supabase.from("transactions").select("*")
      .in("bail_id", bailIds).in("statut", ["impayé", "en_attente"]);

    // Match bank credits with expected rents
    let matched = 0;
    const details: Array<{ bail_id: string; amount: number; date: string; description: string }> = [];
    const usedCredits = new Set<number>();

    for (const tx of pendingTx || []) {
      const bail = baux.find(b => b.id === tx.bail_id);
      if (!bail) continue;

      const expectedTotal = (tx.montant_loyer || 0) + (tx.montant_charges || 0);
      const expectedLoyer = tx.montant_loyer || 0;
      if (expectedTotal <= 0) continue;

      // Find a matching credit: amount ±5% tolerance, in the right month
      const match = credits.find((bt, idx) => {
        if (usedCredits.has(idx)) return false;

        const amount = bt.amount;
        const tolerance = expectedTotal * 0.05;
        const totalMatch = Math.abs(amount - expectedTotal) <= Math.max(tolerance, 5);
        const loyerMatch = Math.abs(amount - expectedLoyer) <= Math.max(tolerance, 5);

        const btDate = new Date(bt.date || bt.booking_date || "");
        const monthMatch = btDate.getMonth() === tx.mois && btDate.getFullYear() === tx.annee;

        return (totalMatch || loyerMatch) && monthMatch;
      });

      if (match) {
        const matchIdx = credits.indexOf(match);
        usedCredits.add(matchIdx);

        const payDate = match.date || match.booking_date || new Date().toISOString().slice(0, 10);
        await supabase.from("transactions").update({
          statut: "payé",
          date_paiement: payDate,
        }).eq("id", tx.id);

        matched++;
        details.push({
          bail_id: tx.bail_id,
          amount: match.amount,
          date: payDate,
          description: match.description || match.raw_description || "—",
        });
      }
    }

    // Update last sync
    await supabase.from("bank_connections").update({ last_sync: new Date().toISOString() }).eq("societe_id", societe_id);

    return new Response(JSON.stringify({
      matched,
      total_pending: (pendingTx || []).length,
      bank_transactions: allBankTx.length,
      credits: credits.length,
      details,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
