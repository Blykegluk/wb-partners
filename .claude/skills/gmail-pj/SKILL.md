---
name: gmail-pj
description: Accéder au contenu des pièces jointes Gmail (PDF, DOCX, XLSX…) via l'Apps Script « gmail-pj », que le connecteur Gmail ne fournit jamais. Utilise ce skill dès qu'il faut lire, analyser, récupérer dans Drive ou renvoyer à quelqu'un une pièce jointe d'un mail d'Anthony — même s'il dit seulement « la PJ », « le PDF du mail », « le devis reçu », « transfère la facture à… ».
---

# Pièces jointes Gmail (Apps Script « gmail-pj »)

Le connecteur Gmail liste les mails et le nom des PJ, mais **jamais leur contenu**.
Un Apps Script comble ce trou. Il s'appelle en GET, par `curl` ou via
`node scripts/gmail-pj.mjs`.

- Base : `https://script.google.com/macros/s/AKfycbzmHOzT7ChF3-zgiTiKWBD6uFXW33o1lLRpainDJun4cmFmm91mh_sa8TZy5qIKYgrW7w/exec`
- Toujours ajouter `token=$GMAIL_PJ_TOKEN`. Le token vit dans la variable
  d'environnement `GMAIL_PJ_TOKEN` (configuration de l'environnement Claude
  Code, ou `.env` local, jamais dans le dépôt : il est public).
  Si la variable est absente, demander le token à Anthony plutôt que deviner.

## 1. Récupérer les PJ d'un ou plusieurs mails dans Drive

```
node scripts/gmail-pj.mjs fetch --q "from:x@y.fr newer_than:7d" --types pdf,docx,xlsx --sinceDays 30 --max 10
```

Équivalent brut :
`<base>?token=…&q=<requête Gmail>&folder=A la demande&types=pdf,docx,xlsx&sinceDays=30&max=10`

- `q` : requête Gmail classique (`from:`, `subject:`, `has:attachment`, `newer_than:7d`…).
  Repérer d'abord le mail avec le connecteur Gmail (`search_threads`) pour cibler la requête.
- `folder` : dossier Drive de destination, par défaut « A la demande ».
  **Ce dossier se purge tout seul après 30 jours** : ne pas y compter pour de l'archivage.
- `types` : extensions autorisées, séparées par des virgules.
- La réponse liste les fichiers créés avec leur `fileId`.
- Ensuite, Drive : `read_file_content(fileId)` pour lire le contenu,
  `download_file_content(fileId)` pour le renvoyer à l'utilisateur.

## 2. Envoyer UNE pièce jointe d'un mail à une adresse

```
node scripts/gmail-pj.mjs send --messageId <id Gmail du message> --attachmentName "<nom exact>" --to <adresse> --dry-run
node scripts/gmail-pj.mjs send --messageId <id Gmail du message> --attachmentName "<nom exact>" --to <adresse>
```

Équivalent brut :
`<base>?token=…&action=sendPj&messageId=<id>&attachmentName=<nom exact>&to=<adresse>[&dryRun=true]`

- `messageId` : l'id **du message** (pas du thread), tel que renvoyé par le connecteur Gmail.
- `attachmentName` : nom exact de la PJ, tel qu'il apparaît dans le mail.
- Réponse : `"sent": true` (envoyé) ou `"skipped": true` (déjà envoyé à cette adresse — le script déduplique).
- `dryRun=true` vérifie sans envoyer.

## Règles

1. **Avant tout envoi, confirmer le destinataire avec Anthony** (adresse exacte,
   et quelle PJ). Faire un `--dry-run` d'abord, montrer le résultat, puis envoyer
   seulement après son accord explicite.
2. Ne jamais écrire le token dans un fichier versionné, un commit, un message ou une URL partagée.
3. Un `"skipped": true` n'est pas une erreur : la PJ a déjà été transmise à cette adresse.
4. En cas de réponse `"ok": false`, lire le champ `error` (messages en français) et corriger les paramètres.
