import { supabase } from './supabase'

const BUCKET = 'documents'
const DEFAULT_TTL = 3600 // 1 hour

// Extract storage path from a stored fichier_url.
// Handles two formats:
//   - new format: bare path like "{societe_id}/{bien_id}/{type}/{timestamp}_{name}"
//   - legacy format: full public URL containing "/object/public/documents/{path}"
//     (kept for backward compat with documents uploaded before the bucket went private)
export function extractPath(fichierUrl) {
  if (!fichierUrl) return null
  if (!fichierUrl.startsWith('http')) return fichierUrl
  const match = fichierUrl.match(/\/object\/(?:public|sign)\/documents\/([^?]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

// Generate a fresh signed URL for a stored document. Returns null on failure.
export async function getSignedUrl(fichierUrl, expiresIn = DEFAULT_TTL) {
  const path = extractPath(fichierUrl)
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  if (error) {
    console.error('Failed to sign URL for', path, error)
    return null
  }
  return data.signedUrl
}

// Open a document in a new tab. Fetches a signed URL just before opening so it never expires before use.
export async function openDocument(fichierUrl) {
  const url = await getSignedUrl(fichierUrl)
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    alert('Impossible de générer le lien d\'accès au document.')
  }
}

// Remove the underlying file from Storage. Safe to call even if path can't be parsed.
export async function removeFile(fichierUrl) {
  const path = extractPath(fichierUrl)
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path])
}
