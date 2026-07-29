-- Phase 4 : apprentissage du rapprochement + synchronisation quotidienne.
--
-- Bridge v3 n'expose ni le nom ni l'IBAN de la contrepartie : le seul
-- élément stable d'un virement récurrent est son libellé. On en extrait une
-- empreinte (jetons significatifs, normalisés, dédoublonnés et triés) que
-- l'on associe au bail dès qu'un rapprochement manuel est confirmé.
--
-- Au virement suivant du même émetteur, l'empreinte redonne le bail : le
-- rapprochement devient automatique sans avoir à desserrer les seuils.

create table if not exists rapprochement_appris (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references societe(id) on delete cascade,
  bail_id uuid not null references baux(id) on delete cascade,
  empreinte text not null,
  occurrences integer not null default 1,
  derniere_utilisation timestamptz default now(),
  created_at timestamptz default now(),
  unique (societe_id, empreinte)
);

create index if not exists idx_rappro_appris_societe on rapprochement_appris(societe_id);

alter table rapprochement_appris enable row level security;

create policy "Members can view rapprochement_appris"
  on rapprochement_appris for select using (societe_id in (select get_my_societe_ids()));
create policy "Editors can insert rapprochement_appris"
  on rapprochement_appris for insert with check (can_edit_societe(societe_id));
create policy "Editors can update rapprochement_appris"
  on rapprochement_appris for update using (can_edit_societe(societe_id));
create policy "Editors can delete rapprochement_appris"
  on rapprochement_appris for delete using (can_edit_societe(societe_id));


-- ── Synchronisation quotidienne ─────────────────────────────
-- Les webhooks Bridge couvrent le temps réel (item.account.updated →
-- bank-sync). Ce cron est un filet : il rattrape un webhook perdu, une
-- fonction indisponible, ou une connexion rétablie après incident.
--
-- Le cron ne présente PAS la clé de service (accès total à la base) mais un
-- jeton dédié, stocké au vault, qui ne sait que déclencher une
-- synchronisation. La clé de service reste dans l environnement des Edge
-- Functions. La fonction bank-sync-cron vérifie ce jeton puis appelle
-- bank-sync pour chaque société connectée.
--
-- PRÉREQUIS : le secret `cron_token` doit exister au vault ET comme secret
-- Edge Function `CRON_TOKEN`, avec la même valeur. Sans lui la fonction ne
-- fait rien et l émet en notice — elle n échoue pas.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function declencher_sync_bancaire()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  jeton text;
begin
  select decrypted_secret into jeton
  from vault.decrypted_secrets where name = 'cron_token';

  if jeton is null then
    raise notice 'Secret cron_token absent du vault : synchronisation ignorée';
    return;
  end if;

  -- bank-sync-cron répond en 202 immédiatement et poursuit en arrière-plan :
  -- pg_net abandonne au bout de 5 s alors qu une synchronisation demande une
  -- quinzaine de secondes par société.
  perform net.http_post(
    url := 'https://zokdctiqmbfnoahhebys.supabase.co/functions/v1/bank-sync-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', jeton
    ),
    body := '{}'::jsonb
  );
end;
$$;

select cron.unschedule('sync-bancaire-quotidien')
where exists (select 1 from cron.job where jobname = 'sync-bancaire-quotidien');

select cron.schedule(
  'sync-bancaire-quotidien',
  '0 5 * * *',
  $$select declencher_sync_bancaire()$$
);
