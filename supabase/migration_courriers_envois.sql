-- ═══════════════════════════════════════════════════════════════
-- Suivi des courriers et envois automatiques
-- Appliquée le 2026-07-30 (migrations : courriers_envoyes_et_envois_config,
-- envois_cron_quotidien, jeton_cron_documents_rpc)
--
-- Jusqu'ici l'application ne gardait des relances qu'un compteur
-- (transactions.relance_count), sans date ni type de document : impossible
-- de répondre à « qu'a-t-on envoyé, quand, à qui ? ». Et les cases
-- « auto avis / auto relance » des baux n'étaient branchées sur rien —
-- la fonction auto-documents existait mais aucune horloge ne l'appelait.
--
-- Trois morceaux :
--   1. courriers_envoyes — l'historique : un enregistrement par document
--      parti (email via contact@wbpartners.fr, ou PDF généré à la main).
--   2. envois_config — le paramétrage par société : quittance automatique,
--      jour d'envoi des avis, délais des paliers de relance.
--   3. l'horloge — pg_cron appelle la fonction Edge auto-documents chaque
--      matin, authentifiée par un jeton stocké au vault.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Historique des courriers ─────────────────────────────────

create table public.courriers_envoyes (
  id             uuid primary key default gen_random_uuid(),
  societe_id     uuid not null references public.societe(id) on delete cascade,
  bail_id        uuid references public.baux(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  type           text not null check (type in
    ('quittance','avis_echeance','facture','relance','mise_en_demeure','commandement')),
  -- Période concernée (mois 0-11 comme partout dans l'application)
  mois           int check (mois between 0 and 11),
  annee          int,
  canal          text not null default 'email' check (canal in ('email','manuel')),
  destinataire   text,
  sujet          text,
  statut         text not null default 'envoye' check (statut in ('envoye','erreur')),
  erreur         text,
  -- NULL = envoi automatique (cron) ; sinon l'utilisateur à l'origine
  envoye_par     uuid references public.profiles(id) on delete set null,
  envoye_le      timestamptz not null default now()
);

create index courriers_envoyes_societe_idx on public.courriers_envoyes (societe_id, envoye_le desc);
create index courriers_envoyes_transaction_idx on public.courriers_envoyes (transaction_id);
create index courriers_envoyes_bail_periode_idx on public.courriers_envoyes (bail_id, type, annee, mois);

alter table public.courriers_envoyes enable row level security;

create policy "Members can view courriers"
  on public.courriers_envoyes for select
  using (societe_id in (select get_my_societe_ids()));

-- L'application journalise les documents générés à la main (canal manuel) ;
-- les envois email passent par la fonction Edge (service role, hors RLS).
create policy "Editors can log courriers"
  on public.courriers_envoyes for insert
  with check (can_edit_societe(societe_id));

-- Pas d'update/delete : l'historique d'envoi ne se réécrit pas.

-- ── 2. Paramétrage des envois par société ───────────────────────

create table public.envois_config (
  societe_id                  uuid primary key references public.societe(id) on delete cascade,
  -- Quittance envoyée dès qu'un loyer est rapproché d'un virement
  quittance_auto              boolean not null default false,
  -- Jour du mois (1-28) où part l'avis d'échéance du mois en cours ;
  -- NULL = pas d'avis automatique
  avis_jour                   int check (avis_jour between 1 and 28),
  -- Paliers de relance, en jours de retard depuis le 1er du mois dû
  relance_apres_jours         int not null default 5,
  mise_en_demeure_apres_jours int not null default 15,
  -- Le commandement de payer n'est JAMAIS envoyé automatiquement : il n'a
  -- de valeur que signifié par commissaire de justice. Ce seuil sert
  -- uniquement à le proposer dans l'écran de suivi.
  commandement_apres_jours    int not null default 30,
  updated_at                  timestamptz not null default now()
);

alter table public.envois_config enable row level security;

create policy "Members can view envois config"
  on public.envois_config for select
  using (societe_id in (select get_my_societe_ids()));

create policy "Admins can insert envois config"
  on public.envois_config for insert
  with check (is_admin_of_societe(societe_id));

create policy "Admins can update envois config"
  on public.envois_config for update
  using (is_admin_of_societe(societe_id))
  with check (is_admin_of_societe(societe_id));

-- ── 3. Horloge quotidienne ──────────────────────────────────────
-- Même dispositif que la synchronisation bancaire : le cron ne présente
-- pas la clé de service mais un jeton dédié, que la fonction Edge
-- vérifie en le relisant au vault avec son client service.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net;

select vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'documents_cron_token')
where not exists (select 1 from vault.decrypted_secrets where name = 'documents_cron_token');

create or replace function public.envois_documents_quotidien()
returns void
language plpgsql
security definer
set search_path = public, net, extensions, pg_temp
as $$
declare
  jeton text;
begin
  select decrypted_secret into jeton
  from vault.decrypted_secrets where name = 'documents_cron_token';

  if jeton is null then
    raise notice 'Secret documents_cron_token absent du vault : envois ignorés';
    return;
  end if;

  perform net.http_post(
    url := 'https://zokdctiqmbfnoahhebys.supabase.co/functions/v1/auto-documents',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', jeton
    ),
    body := jsonb_build_object('mode', 'cron'),
    timeout_milliseconds := 55000
  );
end;
$$;

select cron.unschedule('envois-documents-quotidien')
where exists (select 1 from cron.job where jobname = 'envois-documents-quotidien');

-- 06:30 UTC : après la synchronisation bancaire du matin quand elle existe,
-- pour que les quittances partent sur des rapprochements frais.
select cron.schedule(
  'envois-documents-quotidien',
  '30 6 * * *',
  $$select public.envois_documents_quotidien()$$
);

-- ── 4. Lecture du jeton par la fonction Edge ────────────────────
-- Le schéma vault n'est pas exposé via PostgREST : la fonction Edge ne peut
-- pas lire vault.decrypted_secrets directement. On lui offre un RPC en
-- security definer, exécutable uniquement par service_role.

create or replace function public.jeton_cron_documents()
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'documents_cron_token';
$$;

revoke all on function public.jeton_cron_documents() from public;
revoke all on function public.jeton_cron_documents() from anon;
revoke all on function public.jeton_cron_documents() from authenticated;
grant execute on function public.jeton_cron_documents() to service_role;

-- Seul pg_cron (rôle postgres) doit pouvoir déclencher la passe d'envois :
-- exposée via PostgREST, elle permettrait à n'importe qui de relancer les
-- envois en échec à volonté. (migration envois_documents_quotidien_prive)
revoke all on function public.envois_documents_quotidien() from public;
revoke all on function public.envois_documents_quotidien() from anon;
revoke all on function public.envois_documents_quotidien() from authenticated;
