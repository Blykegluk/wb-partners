import { supabase } from './supabase'

export async function extractFromPDF(fileBase64, mimeType = 'application/pdf') {
  const { data, error } = await supabase.functions.invoke('extract-document', {
    body: { fileBase64, mimeType },
  })

  if (error) {
    // supabase-js wraps non-2xx as FunctionsHttpError — try to extract the real message
    const msg = typeof data === 'object' && data?.error ? data.error : error.message
    throw new Error(msg || "Erreur lors de l'extraction")
  }
  if (data?.error) throw new Error(data.error)

  return data
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
