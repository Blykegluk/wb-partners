-- Migration: actionnariat per société
-- Run this in Supabase SQL Editor.

create table if not exists actionnaires (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid references societe(id) on delete cascade not null,
  nom text not null,
  type text default 'physique' check (type in ('physique', 'morale')),
  siret text,
  pourcentage numeric(5,2) not null check (pourcentage >= 0 and pourcentage <= 100),
  notes text,
  created_at timestamptz default now()
);

alter table actionnaires enable row level security;

create index if not exists idx_actionnaires_societe on actionnaires(societe_id);

drop policy if exists "Members can view actionnaires" on actionnaires;
create policy "Members can view actionnaires"
  on actionnaires for select using (societe_id in (select get_my_societe_ids()));

drop policy if exists "Editors can insert actionnaires" on actionnaires;
create policy "Editors can insert actionnaires"
  on actionnaires for insert with check (can_edit_societe(societe_id));

drop policy if exists "Editors can update actionnaires" on actionnaires;
create policy "Editors can update actionnaires"
  on actionnaires for update using (can_edit_societe(societe_id));

drop policy if exists "Editors can delete actionnaires" on actionnaires;
create policy "Editors can delete actionnaires"
  on actionnaires for delete using (can_edit_societe(societe_id));
