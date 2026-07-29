-- Enable Banking — agrégation bancaire AIS (lecture seule)
--
-- Remplace l'intégration Bridge, retirée pour raison de coût. Les noms de
-- tables sont ceux de la spécification : le conflit qui m'avait fait proposer
-- un préfixe `eb_` a disparu avec les tables Bridge.
--
-- Deux ajouts assumés par rapport à la spécification, tous deux nécessaires
-- pour que le rapprochement des loyers continue de fonctionner — c'est la
-- raison d'être de l'intégration :
--
--   1. bank_transactions porte l'état de rapprochement (statut, échéance liée,
--      score, suggestions). Le moteur de scoring et l'écran Banque existent
--      déjà et sont indépendants du fournisseur ; sans ces colonnes il aurait
--      fallu les jeter.
--   2. societe_id est dénormalisé sur les comptes et les mouvements. La chaîne
--      naturelle (autorisation → session → compte → mouvement) obligerait
--      sinon à une triple jointure dans chaque politique RLS et dans chaque
--      requête de l'écran Banque.
--
-- Sur la RLS : la spécification prévoyait service_role exclusivement. L'écran
-- Banque lit et écrit pourtant ces tables directement avec le jeton de
-- l'utilisateur (qualification manuelle, mise en suivi d'un compte). On
-- applique donc le régime des autres tables du projet — lecture par les
-- membres de la société, écriture par les éditeurs — et on réserve
-- l'insertion au service_role, seul la synchronisation devant créer des
-- lignes. Les tables du flux de consentement (autorisations, sessions), elles,
-- restent bien en service_role exclusif : elles ne contiennent que des jetons.

-- ── Autorisations (flux de consentement) ────────────────────
-- Une ligne par tentative de connexion. `state` est le jeton anti-CSRF que
-- l'on retrouve au retour de la banque.
create table if not exists bank_authorizations (
  id uuid primary key default gen_random_uuid(),
  state uuid not null unique,
  aspsp_name text,
  aspsp_country text,
  societe_id uuid references societe(id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint bank_authorizations_status_check
    check (status in ('pending', 'completed', 'failed'))
);

create index if not exists idx_bank_auth_state on bank_authorizations(state);
create index if not exists idx_bank_auth_societe on bank_authorizations(societe_id);

-- ── Sessions ────────────────────────────────────────────────
-- Obtenue via POST /sessions au retour du consentement. `valid_until` borne la
-- durée de l'accès (90 jours au titre de la DSP2).
create table if not exists bank_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  societe_id uuid references societe(id) on delete set null,
  psu_id_hash text,
  valid_until timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint bank_sessions_status_check
    check (status in ('active', 'expired', 'revoked', 'error'))
);

create index if not exists idx_bank_sessions_status on bank_sessions(status);

-- ── Comptes ─────────────────────────────────────────────────
-- `raw` conserve le payload complet renvoyé par POST /sessions : certaines
-- informations ne sont retournées qu'une seule fois et ne sont plus
-- interrogeables ensuite.
create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references bank_sessions(session_id) on delete cascade,
  societe_id uuid references societe(id) on delete set null,
  account_uid text not null unique,
  iban text,
  name text,
  currency text,
  product text,
  -- Exclut le compte du rapprochement et des totaux sans le supprimer
  -- (compte en devise étrangère, compte personnel...).
  suivi boolean not null default true,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_bank_accounts_session on bank_accounts(session_id);
create index if not exists idx_bank_accounts_societe on bank_accounts(societe_id);

-- ── Mouvements ──────────────────────────────────────────────
-- L'unicité (account_uid, entry_reference) rend la synchronisation idempotente.
--
-- entry_reference est NOT NULL à dessein : en SQL deux NULL ne sont jamais
-- égaux, si bien qu'un mouvement dépourvu de référence — cas courant chez
-- certaines banques — serait réinséré à chaque passage et la table gonflerait
-- silencieusement. La synchronisation doit donc systématiquement passer par
-- referenceStable() (_shared/enablebanking.ts), qui reprend la référence de la
-- banque ou, à défaut, calcule une empreinte déterministe.
create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  account_uid text not null references bank_accounts(account_uid) on delete cascade,
  societe_id uuid references societe(id) on delete set null,
  entry_reference text not null,
  booking_date date,
  value_date date,
  amount numeric,
  currency text,
  credit_debit text,
  remittance_information text,
  counterparty_name text,
  raw jsonb,

  -- Rapprochement — repris de l'intégration précédente, indépendant du
  -- fournisseur.
  statut_rapprochement text not null default 'a_qualifier',
  transaction_id uuid references transactions(id) on delete set null,
  score_confiance numeric,
  suggestions jsonb,
  rapproche_le timestamptz,
  rapproche_par uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bank_transactions_unique unique (account_uid, entry_reference),
  constraint bank_transactions_credit_debit_check
    check (credit_debit is null or credit_debit in ('CRDT', 'DBIT')),
  constraint bank_transactions_statut_check
    check (statut_rapprochement in ('a_qualifier', 'rapproche_auto', 'rapproche_manuel', 'ignore'))
);

create index if not exists idx_bank_tx_account on bank_transactions(account_uid);
create index if not exists idx_bank_tx_societe on bank_transactions(societe_id);
create index if not exists idx_bank_tx_booking on bank_transactions(booking_date desc);
create index if not exists idx_bank_tx_statut on bank_transactions(societe_id, statut_rapprochement);
create index if not exists idx_bank_tx_echeance on bank_transactions(transaction_id);

-- ── RLS ─────────────────────────────────────────────────────

alter table bank_authorizations enable row level security;
alter table bank_sessions       enable row level security;
alter table bank_accounts       enable row level security;
alter table bank_transactions   enable row level security;

-- Autorisations et sessions : aucune policy — elles ne contiennent que des
-- jetons de consentement, seul le service_role y accède.

-- Comptes et mouvements : régime habituel du projet.
create policy "Members can view bank_accounts"
  on bank_accounts for select using (societe_id in (select get_my_societe_ids()));
create policy "Editors can update bank_accounts"
  on bank_accounts for update using (can_edit_societe(societe_id));

create policy "Members can view bank_transactions"
  on bank_transactions for select using (societe_id in (select get_my_societe_ids()));
create policy "Editors can update bank_transactions"
  on bank_transactions for update using (can_edit_societe(societe_id));
