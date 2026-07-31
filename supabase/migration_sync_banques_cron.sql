-- ═══════════════════════════════════════════════════════════════
-- Synchronisation bancaire quotidienne
-- Appliquée le 2026-07-31 (migration : sync_banques_cron_quotidien)
--
-- L'ancien cron de synchronisation datait de l'intégration Bridge et est
-- parti avec elle (drop_bridge_integration) sans être recréé pour Enable
-- Banking : les comptes ne se rafraîchissaient plus qu'au clic sur
-- « Synchroniser ». Or la fenêtre d'historique des banques est bornée
-- (90 jours à 6 mois) : sans passage régulier, des mouvements pourraient
-- devenir irrécupérables. Le cron rend le trou impossible tant que le
-- consentement DSP2 est valide.
--
-- La fonction Edge banking-sync vérifie le JWT au portail : la clé anon
-- (publique par construction) suffit à le franchir ; elle est relue au
-- vault plutôt qu'inscrite en clair dans le code de la fonction SQL.
-- ═══════════════════════════════════════════════════════════════

select vault.create_secret('<clé anon du projet>', 'anon_api_key')
where not exists (select 1 from vault.decrypted_secrets where name = 'anon_api_key');

create or replace function public.sync_banques_quotidien()
returns void
language plpgsql
security definer
set search_path = public, net, extensions, pg_temp
as $$
declare
  cle text;
begin
  select decrypted_secret into cle
  from vault.decrypted_secrets where name = 'anon_api_key';

  if cle is null then
    raise notice 'Secret anon_api_key absent du vault : synchronisation ignorée';
    return;
  end if;

  -- Sans societe_id : toutes les sociétés ayant un compte connecté.
  perform net.http_post(
    url := 'https://zokdctiqmbfnoahhebys.supabase.co/functions/v1/banking-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cle,
      'apikey', cle
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function public.sync_banques_quotidien() from public;
revoke all on function public.sync_banques_quotidien() from anon;
revoke all on function public.sync_banques_quotidien() from authenticated;

select cron.unschedule('sync-banques-quotidien')
where exists (select 1 from cron.job where jobname = 'sync-banques-quotidien');

-- 06:00 UTC, une demi-heure avant les envois de documents (06:30) : les
-- quittances automatiques partent ainsi sur des rapprochements frais.
select cron.schedule(
  'sync-banques-quotidien',
  '0 6 * * *',
  $$select public.sync_banques_quotidien()$$
);
