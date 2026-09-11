#!/usr/bin/env node
// Accès aux pièces jointes Gmail via l'Apps Script « gmail-pj ».
// Le connecteur Gmail ne renvoie jamais le contenu des PJ : ce script
// les copie dans Drive (dossier « A la demande », purgé après 30 jours)
// ou en renvoie UNE à une adresse donnée.
//
//   GMAIL_PJ_TOKEN=... node scripts/gmail-pj.mjs fetch --q "from:x@y.fr newer_than:7d" [--types pdf,docx,xlsx] [--folder "A la demande"] [--sinceDays 30] [--max 10]
//   GMAIL_PJ_TOKEN=... node scripts/gmail-pj.mjs send  --messageId <id> --attachmentName <nom exact> --to <adresse> [--dry-run]
//
// Le token n'est jamais écrit dans le dépôt (public) : il vient de
// l'environnement (GMAIL_PJ_TOKEN) ou de l'option --token.

const BASE_URL =
  'https://script.google.com/macros/s/AKfycbzmHOzT7ChF3-zgiTiKWBD6uFXW33o1lLRpainDJun4cmFmm91mh_sa8TZy5qIKYgrW7w/exec'

const USAGE = `Usage :
  node scripts/gmail-pj.mjs fetch --q <requête Gmail> [--types pdf,docx,xlsx] [--folder "A la demande"] [--sinceDays 30] [--max 10]
  node scripts/gmail-pj.mjs send  --messageId <id> --attachmentName <nom exact> --to <adresse> [--dry-run]

Options communes : --token <token> (sinon variable d'environnement GMAIL_PJ_TOKEN), --json (sortie brute).`

function parseArgs(argv) {
  const [command, ...rest] = argv
  const opts = {}
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (!arg.startsWith('--')) throw new Error(`Argument inattendu : ${arg}`)
    const key = arg.slice(2)
    const next = rest[i + 1]
    if (next === undefined || next.startsWith('--')) {
      opts[key] = true
    } else {
      opts[key] = next
      i++
    }
  }
  return { command, opts }
}

function requireOpt(opts, name) {
  const value = opts[name]
  if (value === undefined || value === true || String(value).trim() === '') {
    throw new Error(`Option --${name} obligatoire.\n\n${USAGE}`)
  }
  return String(value)
}

function buildParams(command, opts) {
  const token = opts.token && opts.token !== true ? String(opts.token) : process.env.GMAIL_PJ_TOKEN
  if (!token) {
    throw new Error(
      "Token manquant : définir GMAIL_PJ_TOKEN dans l'environnement (ou passer --token). Le token ne doit jamais être commité."
    )
  }
  const params = new URLSearchParams({ token })

  if (command === 'fetch') {
    params.set('q', requireOpt(opts, 'q'))
    params.set('folder', opts.folder && opts.folder !== true ? String(opts.folder) : 'A la demande')
    if (opts.types && opts.types !== true) params.set('types', String(opts.types))
    if (opts.sinceDays && opts.sinceDays !== true) params.set('sinceDays', String(opts.sinceDays))
    if (opts.max && opts.max !== true) params.set('max', String(opts.max))
    return params
  }

  if (command === 'send') {
    params.set('action', 'sendPj')
    params.set('messageId', requireOpt(opts, 'messageId'))
    params.set('attachmentName', requireOpt(opts, 'attachmentName'))
    params.set('to', requireOpt(opts, 'to'))
    if (opts['dry-run'] || opts.dryRun) params.set('dryRun', 'true')
    return params
  }

  throw new Error(`Commande inconnue : ${command ?? '(aucune)'}\n\n${USAGE}`)
}

async function call(params) {
  const url = `${BASE_URL}?${params.toString()}`
  const res = await fetch(url, { redirect: 'follow' })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Réponse non JSON (HTTP ${res.status}) : ${text.slice(0, 500)}`)
  }
  return data
}

function printFetch(data) {
  const files = data.saved ?? data.files ?? []
  const skipped = Array.isArray(data.skipped) ? data.skipped : []
  if (!Array.isArray(files) || files.length === 0) {
    console.log(`Aucune pièce jointe créée dans Drive (${data.threadsScanned ?? 0} fil(s) parcouru(s)).`)
  } else {
    const folder = data.folder?.name ? ` dans « ${data.folder.name} »` : ''
    console.log(`${files.length} fichier(s) créé(s)${folder} :`)
    for (const f of files) {
      const name = f.attachmentName ?? f.name ?? '(sans nom)'
      const id = f.fileId ?? f.id ?? '?'
      const extra = [f.from && `de ${f.from}`, f.date && `le ${f.date}`, f.messageId && `messageId ${f.messageId}`]
        .filter(Boolean)
        .join(', ')
      console.log(`  - ${name}  fileId=${id}${extra ? `  (${extra})` : ''}`)
    }
  }
  if (skipped.length > 0) {
    console.log(`${skipped.length} pièce(s) jointe(s) ignorée(s) :`)
    for (const s of skipped) console.log(`  - ${s.attachmentName ?? s.name ?? '?'}${s.reason ? ` : ${s.reason}` : ''}`)
  }
  console.log('\nLecture : Drive read_file_content(fileId) ; renvoi : download_file_content(fileId).')
}

function printSend(data, dryRun) {
  if (dryRun) {
    console.log('Vérification (dryRun) : rien n’a été envoyé.')
  }
  if (data.sent) console.log(`Envoyé : "${data.attachmentName ?? ''}" → ${data.to ?? ''}`.trim())
  else if (data.skipped) console.log(`Ignoré : cette pièce jointe a déjà été envoyée à ${data.to ?? 'cette adresse'}.`)
  else console.log(JSON.stringify(data, null, 2))
}

async function main() {
  const { command, opts } = parseArgs(process.argv.slice(2))
  if (!command || command === '--help' || command === '-h' || opts.help) {
    console.log(USAGE)
    return
  }
  const params = buildParams(command, opts)
  const data = await call(params)

  if (opts.json) {
    console.log(JSON.stringify(data, null, 2))
  } else if (data.ok === false || data.error) {
    console.error(`Erreur Apps Script : ${data.error ?? JSON.stringify(data)}`)
    process.exitCode = 1
    return
  } else if (command === 'fetch') {
    printFetch(data)
  } else {
    printSend(data, Boolean(opts['dry-run'] || opts.dryRun))
  }
  if (data.ok === false || data.error) process.exitCode = 1
}

main().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})
