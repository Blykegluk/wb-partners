import { PDFDocument } from 'pdf-lib'
import { supabase } from './supabase'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'
const MAX_PDF_PAGES = 95

/**
 * Convert Uint8Array to base64 without stack overflow
 * (String.fromCharCode(...bigArray) crashes on large arrays)
 */
function uint8ToBase64(bytes) {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, chunk)
  }
  return btoa(binary)
}

/**
 * If the PDF has more than MAX_PDF_PAGES, create a new PDF
 * with only the first MAX_PDF_PAGES pages.
 */
async function trimPdfIfNeeded(fileBase64) {
  const pdfBytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0))
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const totalPages = srcDoc.getPageCount()

  if (totalPages <= MAX_PDF_PAGES) {
    return { base64: fileBase64, wasTrimmed: false, totalPages }
  }

  const newDoc = await PDFDocument.create()
  const indices = Array.from({ length: MAX_PDF_PAGES }, (_, i) => i)
  const copiedPages = await newDoc.copyPages(srcDoc, indices)
  copiedPages.forEach(page => newDoc.addPage(page))

  const trimmedBytes = await newDoc.save()
  const trimmedBase64 = uint8ToBase64(new Uint8Array(trimmedBytes))

  return { base64: trimmedBase64, wasTrimmed: true, totalPages }
}

export async function extractFromPDF(fileBase64, mimeType = 'application/pdf') {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  let finalBase64 = fileBase64
  let trimInfo = null

  if (mimeType === 'application/pdf' || !mimeType) {
    // Do NOT silently swallow errors — let the user know if trimming fails
    const result = await trimPdfIfNeeded(fileBase64)
    finalBase64 = result.base64
    if (result.wasTrimmed) {
      trimInfo = { totalPages: result.totalPages, sentPages: MAX_PDF_PAGES }
      console.log(`PDF trimmed: ${result.totalPages} pages → ${MAX_PDF_PAGES} pages`)
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
