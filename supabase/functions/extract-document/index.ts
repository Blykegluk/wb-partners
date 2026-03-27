import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_KEY");

const EXTRACT_PROMPT = `Tu es un expert en immobilier commercial français. Analyse ce document et extrais les informations au format JSON strict.

Identifie d'abord le TYPE parmi : bail, amortissement, appel_charges, quittance, autre.

══ Si BAIL ou AVENANT :
{
  "type": "bail",
  "locataire_raison_sociale": "",
  "locataire_nom": "",
  "locataire_prenom": "",
  "locataire_email": "",
  "locataire_telephone": "",
  "locataire_adresse": "",
  "locataire_code_postal": "",
  "locataire_ville": "",
  "adresse": "",
  "ville": "",
  "code_postal": "",
  "surface_rdc": null,
  "surface_sous_sol": null,
  "loyer_mensuel": null,
  "charges": null,
  "type_bail": "commercial|professionnel|habitation",
  "indexation": "ILC|ICC|IRL",
  "attribution_charges": "",
  "date_debut": "YYYY-MM-DD",
  "date_fin": "YYYY-MM-DD",
  "date_revision_anniversaire": "YYYY-MM-DD",
  "depot_garantie": null,
  "utilisation": "",
  "activite": ""
}

══ Si TABLEAU D'AMORTISSEMENT :
{
  "type": "amortissement",
  "montant_emprunt": null,
  "duree_credit": null,
  "taux": null,
  "annuites": null,
  "decalage_pret": null,
  "date_debut_pret": "YYYY-MM-DD"
}

══ Si APPEL DE FONDS / CHARGES / BUDGET PRÉVISIONNEL / DÉCOMPTE DE CHARGES :
{
  "type": "appel_charges",
  "periode": "T1 2025",
  "montant_total": null,
  "lignes": [
    { "poste": "nom du poste", "montant": null, "refacturable": true }
  ]
}
Pour "refacturable": true si récupérable sur locataire (entretien parties communes, eau, ascenseur, espaces verts, électricité communs, assurance immeuble, TEOM, gardiennage). False si non récupérable (gros travaux art.606, ravalement, honoraires syndic, fonds travaux Alur).

══ Si QUITTANCE DE LOYER :
{
  "type": "quittance",
  "locataire_nom": "",
  "periode": "mars 2025",
  "montant_loyer": null,
  "montant_charges": null,
  "date_paiement": "YYYY-MM-DD"
}

══ Si tu ne peux pas identifier le type :
{
  "type": "autre",
  "description": "brève description du document"
}

Réponds UNIQUEMENT avec le JSON, sans commentaire ni markdown.
Les montants doivent être des nombres (pas de symboles €).
Les durées en mois. Les surfaces en m².`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_KEY) {
      throw new Error("ANTHROPIC_KEY not configured");
    }

    const { fileBase64, mimeType } = await req.json();
    if (!fileBase64) throw new Error("fileBase64 is required");

    // Check approximate page count from base64 size (rough: ~50KB per page for a typical PDF)
    const sizeBytes = (fileBase64.length * 3) / 4;
    const estimatedPages = Math.ceil(sizeBytes / 50000);
    const needsTruncation = estimatedPages > 80;

    // Build document content block with optional page range
    const docBlock: Record<string, unknown> = {
      type: "document",
      source: { type: "base64", media_type: mimeType || "application/pdf", data: fileBase64 },
    };

    // For large PDFs, only analyze first 50 pages (bail info is always in the first pages)
    if (needsTruncation && (mimeType === "application/pdf" || !mimeType)) {
      docBlock.pages = [];
      for (let i = 0; i < Math.min(50, estimatedPages); i++) {
        (docBlock.pages as number[]).push(i);
      }
    }

    const extraPrompt = needsTruncation
      ? "\n\nNOTE: Ce document est volumineux. Seules les premières pages sont analysées. Les informations clés (parties, adresse, loyer, dates) se trouvent généralement dans les premières pages."
      : "";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            docBlock,
            { type: "text", text: EXTRACT_PROMPT + extraPrompt },
          ],
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Anthropic API error");

    const text = data.content?.[0]?.text || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("Impossible de parser la réponse IA : " + text.slice(0, 200));
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
