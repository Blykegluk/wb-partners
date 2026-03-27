import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BRIDGE_CLIENT_ID = Deno.env.get("BRIDGE_CLIENT_ID");
const BRIDGE_CLIENT_SECRET = Deno.env.get("BRIDGE_CLIENT_SECRET");
const BRIDGE_VERSION = "2025-01-15";
const BRIDGE_BASE = "https://api.bridgeapi.io/v3/aggregation";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const baseHeaders = () => ({
  "Content-Type": "application/json",
  "Client-Id": BRIDGE_CLIENT_ID!,
  "Client-Secret": BRIDGE_CLIENT_SECRET!,
  "Bridge-Version": BRIDGE_VERSION,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!BRIDGE_CLIENT_ID || !BRIDGE_CLIENT_SECRET) throw new Error("Bridge credentials not configured");

    const { societe_id, callback_url, user_email } = await req.json();
    if (!societe_id || !callback_url) throw new Error("societe_id and callback_url required");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: existing } = await supabase.from("bank_connections")
      .select("*").eq("societe_id", societe_id).maybeSingle();

    let bridgeUserUuid = existing?.bridge_user_uuid;

    // 1. Create Bridge user if needed
    if (!bridgeUserUuid) {
      const res = await fetch(`${BRIDGE_BASE}/users`, {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ external_user_id: societe_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || JSON.stringify(data));
      bridgeUserUuid = data.uuid;
    }

    // 2. Get user auth token
    const tokenRes = await fetch(`${BRIDGE_BASE}/authorization/token`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ user_uuid: bridgeUserUuid }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.message || tokenData.error || JSON.stringify(tokenData));
    const userToken = tokenData.access_token || tokenData.token;

    // 3. Create Connect session
    const connectRes = await fetch(`${BRIDGE_BASE}/connect-sessions`, {
      method: "POST",
      headers: {
        ...baseHeaders(),
        "Authorization": `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        callback_url,
        ...(user_email ? { user_email } : {}),
      }),
    });
    const connectData = await connectRes.json();
    if (!connectRes.ok) throw new Error(connectData.message || connectData.error || JSON.stringify(connectData));

    // 4. Store in DB
    await supabase.from("bank_connections").upsert({
      societe_id,
      bridge_user_uuid: bridgeUserUuid,
      bridge_user_token: userToken,
      status: "pending",
    }, { onConflict: "societe_id" });

    return new Response(JSON.stringify({ url: connectData.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
