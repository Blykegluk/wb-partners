const ANTHROPIC_KEY = () => import.meta.env.VITE_ANTHROPIC_KEY

const EXTRACT_PROMPT = `Tu es un expert en immobilier commercial français. Analyse ce document et extrais les informations suivantes au format JSON strict.

Si le document est un BAIL ou AVENANT, extrais :
{
  "type": "bail",
  "locataire_raison_sociale": "",
  "locataire_nom": "",
  "locataire_prenom": "",
  "locataire_email": "",
  "locataire_telephone": "",
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
  "depot_garantie": null,
  "utilisation": "",
  "activite": ""
}

Si le document est un TABLEAU D'AMORTISSEMENT, extrais :
{
  "type": "amortissement",
  "montant_emprunt": null,
  "duree_credit": null,
  "taux": null,
  "annuites": null,
  "decalage_pret": null,
  "date_debut_pret": "YYYY-MM-DD"
}

Réponds UNIQUEMENT avec le JSON, sans commentaire ni markdown.
Les montants doivent être des nombres (pas de symboles €).
Les durées en mois. Les surfaces en m².`

export async function extractFromPDF(fileBase64, mimeType = 'application/pdf') {
  const key = ANTHROPIC_KEY()
  if (!key) throw new Error('Clé API Anthropic non configurée (VITE_ANTHROPIC_KEY)')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: mimeType, data: fileBase64 },
            },
            { type: 'text', text: EXTRACT_PROMPT },
          ],
        },
      ],
    }),
  })

  const data = await response.json()
  const text = data.content?.[0]?.text || ''

  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('Impossible de parser la réponse IA : ' + text.slice(0, 200))
  }
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
