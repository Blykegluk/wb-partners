import { PDFDocument } from 'pdf-lib'
import { supabase } from './supabase'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'
const MAX_PDF_PAGES = 95 // stay under Anthropic's 100-page hard limit

/**
 * If the PDF has more than MAX_PDF_PAGES pages, create a new PDF
 * containing only the first MAX_PDF_PAGES pages.
 * Returns { base64, wasTrimmed, totalPages }
 */
async function trimPdfIfNeeded(fileBase64) {
  const pdfBytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0))
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const totalPages = srcDoc.getPageCount()

  if (totalPages <= MAX_PDF_PAGES) {
    return { base64: fileBase64, wasTrimmed: false, totalPages }
  }

  // Create a new PDF with only the first N pages
  const newDoc = await PDFDocument.create()
  const indices = Array.from({ length: MAX_PDF_PAGES }, (_, i) => i)
  const copiedPages = await newDoc.copyPages(srcDoc, indices)
  copiedPages.forEach(page => newDoc.addPage(page))

  const trimmedBytes = await newDoc.save()
  const trimmedBase64 = btoa(String.fromCharCode(...trimmedBytes))

  return { base64: trimmedBase64, wasTrimmed: true, totalPages }
}

export async function extractFromPDF(fileBase64, mimeType = 'application/pdf') {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  // For PDFs, trim to MAX_PDF_PAGES if needed
  let finalBase64 = fileBase64
  let trimInfo = null
  if (mimeType === 'application/pdf' || !mimeType) {
    try {
      const result = await trimPdfIfNeeded(fileBase64)
      finalBase64 = result.base64
      if (result.wasTrimmed) {
        trimInfo = { totalPages: result.totalPages, sentPages: MAX_PDF_PAGES }
      }
    } catch {
      // If pdf-lib can't parse (encrypted, corrupted), send as-is and let the API handle it
      finalBase64 = fileBase64
    }
  }

  const res = await fetch(`${FUNCTIONS_URL}/extract-document`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ fileBase64: finalBase64, mimeType }),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `Erreur ${res.status} lors de l'extraction`)
  }

  // Attach trim info so the UI can inform the user
  if (trimInfo) {
    data._trimInfo = trimInfo
  }

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
