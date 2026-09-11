-- Alerte par mail quand la synchronisation bancaire quotidienne n'aboutit pas
--
-- Motif : une synchronisation muette est plus dangereuse qu'une panne visible.
-- Les soldes et les mouvements restent figés à leur dernière valeur connue,
-- les loyers encaissés depuis ne sont pas rapprochés, et les relances
-- automatiques (`envois-documents-quotidien`, 06:30 UTC) partent alors sur des
-- échéances en réalité payées.
--
-- Le signal retenu n'est PAS le code de retour de la synchronisation : pg_net
-- écrit sa réponse de façon asynchrone, et un appel peut répondre 200 sans
-- avoir rien rafraîchi. On observe l'effet — la fraîcheur de
-- `bank_accounts.derniere_sync` — ce qui couvre d'un même geste l'erreur
-- applicative, le dépassement de délai, la fonction en panne et le
-- consentement DSP2 expiré.

-- ── Jeton d'appel ───────────────────────────────────────────
-- Les fonctions d'alerte sont appelées par le cron, qui ne détient pas la clé
-- de service. Même schéma que `documents_cron_token` : un secret au vault,
-- relu par un RPC security definer que la fonction Edge interroge.
--
-- select vault.create_secret(gen_random_uuid()::text, 'alertes_cron_token',
--   'Jeton d''appel des fonctions d''alerte par pg_cron');

create or replace function public.jeton_cron_alertes()
returns text language sql security definer
set search_path to 'public', 'vault', 'pg_temp'
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'alertes_cron_token' $$;

revoke all on function public.jeton_cron_alertes() from public, anon, authenticated;

-- ── Réglages ────────────────────────────────────────────────
-- Destinataires : une ou plusieurs adresses séparées par des virgules. Sans
-- destinataire valide, la fonction ne tente aucun envoi et le journalise.
-- Seuil : nombre d'heures au-delà duquel une synchronisation est tenue pour
-- manquée. 20 h place la frontière sans ambiguïté entre une synchro réussie
-- (moins d'une heure au moment du contrôle) et une synchro manquée (plus de
-- vingt-quatre). L'abaisser le temps d'un appel permet d'éprouver la chaîne
-- d'envoi sans attendre une panne réelle.
--
-- insert into veille_config (cle, contenu) values
--   ('alerte_sync_email', '<adresse@exemple.fr>'),
--   ('alerte_sync_seuil_heures', '20')
-- on conflict (cle) do update set contenu = excluded.contenu, maj_le = now();

-- ── Déclenchement ───────────────────────────────────────────
create or replace function public.alerte_sync_banques()
returns void language plpgsql security definer
set search_path to 'public', 'net', 'extensions', 'pg_temp'
as $function$
declare
  jeton text;
begin
  select decrypted_secret into jeton
  from vault.decrypted_secrets where name = 'alertes_cron_token';

  if jeton is null then
    raise notice 'Secret alertes_cron_token absent du vault : alerte ignorée';
    return;
  end if;

  perform net.http_post(
    url := 'https://zokdctiqmbfnoahhebys.supabase.co/functions/v1/alerte-sync-banques',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', jeton
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$function$;

revoke all on function public.alerte_sync_banques() from public, anon, authenticated;

select cron.unschedule('alerte-sync-banques')
where exists (select 1 from cron.job where jobname = 'alerte-sync-banques');

-- 07:00 UTC, une heure après la synchronisation (06:00) : le temps qu'elle
-- aboutisse et que pg_net ait écrit sa réponse. Reste quotidien même si la
-- veille passe à 3 jours — c'est la banque qu'on surveille, pas les annonces.
select cron.schedule(
  'alerte-sync-banques',
  '0 7 * * *',
  $$select public.alerte_sync_banques()$$
);
