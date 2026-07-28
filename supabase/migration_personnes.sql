-- Annuaire de personnes partagé + fiches de contact
--
-- Problème résolu : `actionnaires` rattache une personne à UNE société. La
-- même personne détenant deux sociétés existait donc en double, et il était
-- impossible de la sélectionner comme co-détenteur d'un bien d'une société
-- où elle n'était pas actionnaire.
--
-- `personnes` devient l'identité unique (avec ses coordonnées, utilisées
-- plus tard pour l'envoi de courriers et de rapports). `actionnaires` et
-- `bien_actionnaires` la référencent.
--
-- Migration additive : les colonnes historiques (actionnaires.nom/type/siret,
-- bien_actionnaires.nom_externe/actionnaire_id) sont conservées et servent de
-- repli pour les lignes antérieures.

create table if not exists personnes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  nom text not null,
  type text not null default 'physique',
  -- Identité / contact — servent aux courriers et rapports.
  siret text,
  email text,
  telephone text,
  adresse text,
  code_postal text,
  ville text,
  pays text default 'France',
  date_naissance date,
  lieu_naissance text,
  nationalite text,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_personnes_created_by on personnes(created_by);

alter table actionnaires add column if not exists personne_id uuid references personnes(id) on delete set null;
alter table bien_actionnaires add column if not exists personne_id uuid references personnes(id) on delete set null;

create index if not exists idx_actionnaires_personne on actionnaires(personne_id);
create index if not exists idx_bien_actionnaires_personne on bien_actionnaires(personne_id);

-- Visibilité : le créateur, ou tout membre d'une société à laquelle la
-- personne est rattachée. SECURITY DEFINER pour éviter la récursion RLS
-- entre personnes / actionnaires / bien_actionnaires.
create or replace function can_access_personne(p_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from personnes p where p.id = p_id and p.created_by = auth.uid())
      or exists (select 1 from actionnaires a
                 where a.personne_id = p_id and a.societe_id in (select get_my_societe_ids()))
      or exists (select 1 from bien_actionnaires b
                 where b.personne_id = p_id and b.societe_id in (select get_my_societe_ids()));
$$;

alter table personnes enable row level security;

create policy "Users can view accessible personnes"
  on personnes for select
  using (can_access_personne(id));

create policy "Users can insert their personnes"
  on personnes for insert
  with check (created_by = auth.uid());

create policy "Users can update accessible personnes"
  on personnes for update
  using (can_access_personne(id));

create policy "Creators can delete their personnes"
  on personnes for delete
  using (created_by = auth.uid());


-- ── Backfill ────────────────────────────────────────────────
-- Une fiche par nom distinct (dédoublonnage insensible casse/espaces).

with distincts as (
  select distinct on (lower(trim(a.nom)))
         trim(a.nom) as nom, a.type, a.siret, s.owner_id
  from actionnaires a
  join societe s on s.id = a.societe_id
  where a.personne_id is null
  order by lower(trim(a.nom)), a.created_at nulls last
)
insert into personnes (created_by, nom, type, siret)
select owner_id, nom, coalesce(type, 'physique'), siret from distincts;

update actionnaires a
set personne_id = p.id
from personnes p
where a.personne_id is null and lower(trim(p.nom)) = lower(trim(a.nom));

with distincts as (
  select distinct on (lower(trim(b.nom_externe)))
         trim(b.nom_externe) as nom, s.owner_id
  from bien_actionnaires b
  join societe s on s.id = b.societe_id
  where b.personne_id is null and b.nom_externe is not null
    and not exists (select 1 from personnes p where lower(trim(p.nom)) = lower(trim(b.nom_externe)))
  order by lower(trim(b.nom_externe)), b.created_at nulls last
)
insert into personnes (created_by, nom, type)
select owner_id, nom, 'physique' from distincts;

update bien_actionnaires b
set personne_id = p.id
from personnes p
where b.personne_id is null and b.nom_externe is not null
  and lower(trim(p.nom)) = lower(trim(b.nom_externe));

update bien_actionnaires b
set personne_id = a.personne_id
from actionnaires a
where b.personne_id is null and b.actionnaire_id = a.id and a.personne_id is not null;
