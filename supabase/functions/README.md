# Connexion bancaire — Enable Banking

Lecture seule des comptes bancaires des sociétés du groupe, pour rapprocher
automatiquement les loyers attendus des virements réellement reçus.

## Ce qui se passe, dans l'ordre

1. **Paramètres → Banque** : l'utilisateur choisit sa banque et clique
   « Connecter ce compte ».
2. `banking-connect` ouvre un consentement auprès d'Enable Banking et renvoie
   l'URL de la banque. Le navigateur y est redirigé.
3. L'utilisateur s'authentifie chez sa banque et autorise l'accès.
4. La banque renvoie le navigateur vers `banking-callback`, qui échange le code
   contre une session, **enregistre immédiatement la session et tous les
   comptes**, puis redirige vers `/app/banques?connected=1`.
5. `banking-sync` récupère les mouvements et lance le rapprochement.

## Secrets requis

```bash
supabase secrets set ENABLEBANKING_APP_ID=<id vu dans le Control Panel>
supabase secrets set ENABLEBANKING_PRIVATE_KEY="$(cat cle.pem)"
```

La clé doit être au format **PKCS8** (elle commence par `BEGIN PRIVATE KEY`).
Si la vôtre commence par `BEGIN RSA PRIVATE KEY`, c'est du PKCS1, à convertir :

```bash
openssl pkcs8 -topk8 -nocrypt -in cle.pem -out cle_pkcs8.pem
```

Ne jamais committer le `.pem` — il est couvert par le `.gitignore`.

## Développement local

```bash
supabase functions serve --env-file supabase/.env.local
```

`supabase/.env.local` (non versionné) reprend les deux secrets ci-dessus plus
`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.

Pour tester le parcours complet en local, l'URL de redirection doit être
joignable depuis la banque : exposez le port avec un tunnel (`ngrok http 54321`)
et renseignez cette URL publique dans le Control Panel Enable Banking.

## Tester

```bash
# Ouvrir un consentement (renvoie l'URL de la banque)
curl -X POST http://localhost:54321/functions/v1/banking-connect \
  -H "Authorization: Bearer <jeton utilisateur>" \
  -H "Content-Type: application/json" \
  -d '{"aspsp_name":"Societe Generale Professionnels","aspsp_country":"FR","societe_id":"<uuid>"}'

# Synchroniser une société
curl -X POST http://localhost:54321/functions/v1/banking-sync \
  -H "Authorization: Bearer <jeton>" \
  -H "Content-Type: application/json" \
  -d '{"societe_id":"<uuid>"}'
```

## Points d'attention

**`banking-callback` doit avoir `verify_jwt = false`.** C'est le navigateur qui
l'appelle, sans en-tête `Authorization`. La ligne figure dans
`supabase/config.toml`, mais elle ne s'applique qu'aux déploiements par la CLI :
en cas de déploiement par un autre moyen, décocher « Verify JWT » sur la
fonction depuis le dashboard. Sinon la réponse est un 401 et le parcours casse
sans message.

**Le consentement expire au bout de 90 jours** (plafond fixé par la DSP2).
`banking-sync` marque alors la session `expired` au lieu d'échouer, et l'écran
Banque invite à reconnecter.

**L'unicité des mouvements** repose sur `(account_uid, entry_reference)`.
Certaines banques ne fournissent pas de référence : `referenceStable()` calcule
alors une empreinte déterministe à partir de la date, du montant et du libellé,
préfixée `derive:`. Sans cela, deux `NULL` n'étant jamais égaux en SQL, les
mouvements concernés seraient réinsérés à chaque synchronisation.

## Organisation

| Fichier | Rôle |
| --- | --- |
| `_shared/enablebanking.ts` | Signature JWT RS256, appels à l'API |
| `_shared/banking-store.ts` | Persistance, synchronisation, rapprochement |
| `_shared/rapprochement.ts` | Moteur de scoring (indépendant du fournisseur) |
| `banking-connect` | Ouvre le consentement |
| `banking-callback` | Retour de la banque |
| `banking-sync` | Mouvements + rapprochement |

Les Edge Functions restent minces : toute la logique métier est dans `_shared/`.
