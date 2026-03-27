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
    const { societe_id } = await req.json();
    if (!societe_id) throw new Error("societe_id required");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get bank connection
    const { data: conn } = await supabase.from("bank_connections")
      .select("*").eq("societe_id", societe_id).single();
    if (!conn || !conn.account_id) throw new Error("Aucun compte bancaire connecté");

    const token = await getGCToken();

    // Fetch transactions from last 90 days
    const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const res = await fetch(`${GC_BASE}/accounts/${conn.account_id}/transactions/?date_from=${dateFrom}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const txData = await res.json();
    if (!res.ok) throw new Error(txData.detail || "Failed to fetch transactions");

    const bankTx = [
      ...(txData.transactions?.booked || []),
      ...(txData.transactions?.pending || []),
    ];

    // Get all unpaid/pending transactions for this société
    const { data: baux } = await supabase.from("baux").select("id, loyer_ht, charges, locataire_id")
      .eq("societe_id", societe_id).eq("actif", true);
    if (!baux || baux.length === 0) {
      await supabase.from("bank_connections").update({ last_sync: new Date().toISOString() }).eq("societe_id", societe_id);
      return new Response(JSON.stringify({ matched: 0, bank_transactions: bankTx.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bailIds = baux.map(b => b.id);
    const { data: pendingTx } = await supabase.from("transactions").select("*")
      .in("bail_id", bailIds).in("statut", ["impayé", "en_attente"]);

    // Match: find bank transactions that match expected rent amounts
    let matched = 0;
    const matchDetails: Array<{ transaction_id: string; bank_ref: string; amount: number; date: string }> = [];

    for (const tx of pendingTx || []) {
      const bail = baux.find(b => b.id === tx.bail_id);
      if (!bail) continue;

      const expectedAmount = (tx.montant_loyer || 0) + (tx.montant_charges || 0);
      if (expectedAmount <= 0) continue;

      // Look for a credit (positive) bank transaction matching the amount (±5% tolerance)
      const match = bankTx.find(bt => {
        const amount = parseFloat(bt.transactionAmount?.amount || "0");
        if (amount <= 0) return false; // Only credits (incoming money)

        const tolerance = expectedAmount * 0.05;
        const amountMatch = Math.abs(amount - expectedAmount) <= tolerance;

        // Check date is in the right month
        const btDate = new Date(bt.bookingDate || bt.valueDate || "");
        const txMonth = tx.mois;
        const txYear = tx.annee;
        const dateMatch = btDate.getMonth() === txMonth && btDate.getFullYear() === txYear;

        // Also try: amount matches loyer_ht only (without charges)
        const loyerOnlyMatch = Math.abs(amount - (tx.montant_loyer || 0)) <= tolerance;

        return (amountMatch || loyerOnlyMatch) && dateMatch;
      });

      if (match) {
        const bookingDate = match.bookingDate || match.valueDate || new Date().toISOString().slice(0, 10);
        await supabase.from("transactions").update({
          statut: "payé",
          date_paiement: bookingDate,
        }).eq("id", tx.id);

        matched++;
        matchDetails.push({
          transaction_id: tx.id,
          bank_ref: match.transactionId || match.internalTransactionId || "—",
          amount: parseFloat(match.transactionAmount?.amount || "0"),
          date: bookingDate,
        });

        // Remove matched bank tx to avoid double-matching
        const idx = bankTx.indexOf(match);
        if (idx > -1) bankTx.splice(idx, 1);
      }
    }

    // Update last sync timestamp
    await supabase.from("bank_connections").update({ last_sync: new Date().toISOString() }).eq("societe_id", societe_id);

    return new Response(JSON.stringify({
      matched,
      total_pending: (pendingTx || []).length,
      bank_transactions: (txData.transactions?.booked?.length || 0) + (txData.transactions?.pending?.length || 0),
      details: matchDetails,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
