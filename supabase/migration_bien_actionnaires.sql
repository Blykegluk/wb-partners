-- Détention par bien
--
-- Complète `actionnaires` (répartition du capital de la société) par une
-- répartition de la propriété au niveau de chaque bien : un bien peut être
-- détenu partiellement par la société et partiellement par des tiers
-- (actionnaires déjà enregistrés, ou détenteurs externes saisis librement).
--
-- Un bien sans ligne ici est réputé détenu à 100 % par la société.
-- Le solde non attribué (100 % − somme des lignes) reste à la société.

create table if not exists bien_actionnaires (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references societe(id) on delete cascade,
  bien_id uuid not null references biens(id) on delete cascade,
  -- Soit on pointe un actionnaire déjà enregistré sur la société...
  actionnaire_id uuid references actionnaires(id) on delete set null,
  -- ...soit on saisit un détenteur externe libre ("Autre").
  nom_externe text,
  pourcentage numeric not null check (pourcentage >= 0 and pourcentage <= 100),
  notes text,
  created_at timestamptz default now(),
  -- Exactement une des deux sources d'identité doit être renseignée.
  constraint bien_actionnaires_identite_check check (
    (actionnaire_id is not null and nom_externe is null)
    or (actionnaire_id is null and nom_externe is not null and length(trim(nom_externe)) > 0)
  )
);

create index if not exists idx_bien_actionnaires_bien on bien_actionnaires(bien_id);
create index if not exists idx_bien_actionnaires_societe on bien_actionnaires(societe_id);

alter table bien_actionnaires enable row level security;

-- Mêmes règles que la table `actionnaires`.
create policy "Members can view bien_actionnaires"
  on bien_actionnaires for select
  using (societe_id in (select get_my_societe_ids()));

create policy "Editors can insert bien_actionnaires"
  on bien_actionnaires for insert
  with check (can_edit_societe(societe_id));

create policy "Editors can update bien_actionnaires"
  on bien_actionnaires for update
  using (can_edit_societe(societe_id));

create policy "Editors can delete bien_actionnaires"
  on bien_actionnaires for delete
  using (can_edit_societe(societe_id));
