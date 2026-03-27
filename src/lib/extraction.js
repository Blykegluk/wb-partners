import { PDFDocument } from 'pdf-lib'
import { supabase } from './supabase'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'
const MAX_PDF_PAGES = 90

/**
 * Decode base64 to Uint8Array using fetch (memory-efficient, no atob limit)
 */
async function base64ToBytes(b64) {
  const res = await fetch(`data:application/octet-stream;base64,${b64}`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Encode Uint8Array to base64 using FileReader (memory-efficient, no btoa limit)
 */
function bytesToBase64(bytes) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      resolve(dataUrl.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(new Blob([bytes], { type: 'application/pdf' }))
  })
}

/**
 * If the PDF has more than MAX_PDF_PAGES, create a trimmed version.
 */
async function trimPdfIfNeeded(fileBase64) {
  let pdfBytes
  try {
    pdfBytes = await base64ToBytes(fileBase64)
  } catch (e) {
    console.warn('base64 decode failed, sending as-is:', e)
    return { base64: fileBase64, wasTrimmed: false, totalPages: 0 }
  }

  let srcDoc
  try {
    srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  } catch (e) {
    console.warn('pdf-lib load failed, sending as-is:', e)
    return { base64: fileBase64, wasTrimmed: false, totalPages: 0 }
  }

  const totalPages = srcDoc.getPageCount()
  console.log(`PDF has ${totalPages} pages`)

  if (totalPages <= MAX_PDF_PAGES) {
    return { base64: fileBase64, wasTrimmed: false, totalPages }
  }

  console.log(`Trimming PDF from ${totalPages} to ${MAX_PDF_PAGES} pages...`)
  const newDoc = await PDFDocument.create()
  const indices = Array.from({ length: MAX_PDF_PAGES }, (_, i) => i)
  const copiedPages = await newDoc.copyPages(srcDoc, indices)
  copiedPages.forEach(page => newDoc.addPage(page))

  const trimmedBytes = await newDoc.save()
  const trimmedBase64 = await bytesToBase64(trimmedBytes)

  console.log(`Trimmed PDF: ${trimmedBase64.length} chars base64`)
  return { base64: trimmedBase64, wasTrimmed: true, totalPages }
}

export async function extractFromPDF(fileBase64, mimeType = 'application/pdf') {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  let finalBase64 = fileBase64
  let trimInfo = null

  // Always try to trim PDFs
  if (!mimeType || mimeType === 'application/pdf') {
    const result = await trimPdfIfNeeded(fileBase64)
    finalBase64 = result.base64
    if (result.wasTrimmed) {
      trimInfo = { totalPages: result.totalPages, sentPages: MAX_PDF_PAGES }
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

  if (trimInfo) data._trimInfo = trimInfo
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
