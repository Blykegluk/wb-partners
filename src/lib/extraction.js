import { supabase } from './supabase'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

export async function extractFromPDF(fileBase64, mimeType = 'application/pdf') {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(`${FUNCTIONS_URL}/extract-document`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ fileBase64, mimeType }),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `Erreur ${res.status} lors de l'extraction`)
  }

  return data
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
