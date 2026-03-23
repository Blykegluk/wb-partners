-- ============================================================
-- WB Partners — Phase 3 Migration
-- Run this in Supabase SQL Editor AFTER phase 1 migration
-- ============================================================

-- 1. REVISIONS LOYER ─────────────────────────────────────────

create table revisions_loyer (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid references societe(id) on delete cascade not null,
  bail_id uuid references baux(id) on delete cascade not null,
  date_revision date not null,
  indice_type text not null default 'ILC',
  ancien_indice numeric,
  nouvel_indice numeric,
  ancien_loyer numeric not null,
  nouveau_loyer numeric not null,
  appliquee boolean default false,
  created_at timestamptz default now()
);

alter table revisions_loyer enable row level security;

create policy "Members can view revisions"
  on revisions_loyer for select
  using (societe_id in (select get_my_societe_ids()));

create policy "Editors can insert revisions"
  on revisions_loyer for insert
  with check (can_edit_societe(societe_id));

create policy "Editors can update revisions"
  on revisions_loyer for update
  using (can_edit_societe(societe_id));

create policy "Editors can delete revisions"
  on revisions_loyer for delete
  using (can_edit_societe(societe_id));

create index idx_revisions_bail on revisions_loyer(bail_id);
create index idx_revisions_societe on revisions_loyer(societe_id);


-- 2. EVENEMENTS BIEN ─────────────────────────────────────────

create table evenements_bien (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid references societe(id) on delete cascade not null,
  bien_id uuid references biens(id) on delete cascade not null,
  type text not null check (type in (
    'bail_debut', 'bail_fin', 'revision', 'document',
    'travaux', 'sinistre', 'autre'
  )),
  date_evenement date not null,
  titre text not null,
  description text,
  montant numeric,
  created_at timestamptz default now()
);

alter table evenements_bien enable row level security;

create policy "Members can view evenements"
  on evenements_bien for select
  using (societe_id in (select get_my_societe_ids()));

create policy "Editors can insert evenements"
  on evenements_bien for insert
  with check (can_edit_societe(societe_id));

create policy "Editors can update evenements"
  on evenements_bien for update
  using (can_edit_societe(societe_id));

create policy "Editors can delete evenements"
  on evenements_bien for delete
  using (can_edit_societe(societe_id));

create index idx_evenements_bien on evenements_bien(bien_id);
create index idx_evenements_societe on evenements_bien(societe_id);
