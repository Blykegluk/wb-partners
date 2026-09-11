# WB Partners - Project Context

## Purpose
Real estate investment platform

## Document standards
- All financial outputs in French
- Use French legal/accounting terminology
- Yields expressed as gross (rendement brut)
- Always include source and date on market data

## Key reminders
- Investment dossiers follow a fixed structure: zone > bien > chiffres > verdict
- Never give investment advice, only structured analysis

## Pièces jointes Gmail
- Le connecteur Gmail ne donne jamais le contenu des PJ : utiliser le skill `gmail-pj`
  (`.claude/skills/gmail-pj/SKILL.md`, script `scripts/gmail-pj.mjs`).
- Token dans la variable d'environnement `GMAIL_PJ_TOKEN`, jamais dans le dépôt (public).
- Toujours confirmer le destinataire avec Anthony avant d'envoyer une PJ (`--dry-run` d'abord).
- Le dossier Drive « A la demande » se purge automatiquement après 30 jours.

## Allowed bash commands
- curl *
- npm *
- git *
- node *
- python3 *
- pip *
- npx gh-pages *
- rm -rf node_modules/.cache/*

## Bash mode
autoApprove: true
