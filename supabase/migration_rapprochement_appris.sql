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
-- pg_cron + pg_net plutôt qu'une GitHub Action : l'appel reste interne à
-- Supabase, ce qui évite d'exposer une clé de service dans le dépôt.
--
-- PRÉREQUIS : les secrets `project_url` et `service_role_key` doivent être
-- présents dans le vault Supabase. Sans eux la fonction ne fait rien et
-- l'émet en notice — elle n'échoue pas.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function declencher_sync_bancaire()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c record;
  url text;
  cle text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into cle from vault.decrypted_secrets where name = 'service_role_key';
  if url is null or cle is null then
    raise notice 'Secrets project_url / service_role_key absents du vault : sync ignorée';
    return;
  end if;

  for c in select societe_id from bank_connections where status = 'connected' loop
    perform net.http_post(
      url := url || '/functions/v1/bank-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || cle
      ),
      body := jsonb_build_object('societe_id', c.societe_id)
    );
  end loop;
end;
$$;

select cron.unschedule('sync-bancaire-quotidien')
where exists (select 1 from cron.job where jobname = 'sync-bancaire-quotidien');

select cron.schedule(
  'sync-bancaire-quotidien',
  '0 5 * * *',
  $$select declencher_sync_bancaire()$$
);
