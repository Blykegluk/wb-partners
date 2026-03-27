import { corsHeaders } from "../_shared/cors.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_KEY");

const EXTRACT_PROMPT = `Tu es un expert en immobilier commercial français. Analyse ce document et extrais les informations au format JSON strict.

IMPORTANT: Identifie d'abord le TYPE du document parmi : bail, amortissement, appel_charges, quittance, autre.
ATTENTION à bien distinguer :
- "quittance" = quittance de LOYER émise par un bailleur à un locataire, confirmant le paiement d'un loyer. Mentionne généralement "quittance", un locataire, un loyer mensuel, une période (mois).
- "appel_charges" = appel de fonds/charges de COPROPRIÉTÉ émis par un syndic. Mentionne généralement "syndic", "copropriété", "charges de copropriété", des postes détaillés (entretien, ascenseur, etc.)
Ne confonds PAS les deux.

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

Réponds UNIQUEMENT avec le JSON, sans commentaire ni markdown ni backticks.
Les montants doivent être des nombres (pas de symboles €).
Les durées en mois. Les surfaces en m².`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GEMINI_KEY) {
      throw new Error("GEMINI_KEY not configured in Edge Function secrets");
    }

    const { fileBase64, mimeType } = await req.json();
    if (!fileBase64) throw new Error("fileBase64 is required");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType || "application/pdf",
                  data: fileBase64,
                },
              },
              { text: EXTRACT_PROMPT },
            ],
          }],
          generationConfig: {
            maxOutputTokens: 4096,
            temperature: 0.1,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const msg = data.error?.message || JSON.stringify(data.error) || "Gemini API error";
      throw new Error(msg);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code blocks or surrounding text
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error("Impossible de parser la réponse IA : " + text.slice(0, 300));
      }
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
