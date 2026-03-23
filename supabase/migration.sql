-- ============================================================
-- WB Partners — Database Schema
-- Run this in Supabase SQL Editor (full script)
-- ============================================================

-- 0. PROFILES (sync with auth.users) ─────────────────────────

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Public profiles are viewable by authenticated"
  on profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- 1. SOCIETE ──────────────────────────────────────────────────

create table societe (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  nom text not null,
  nom_affiche text,
  siret text,
  rcs text,
  iban text,
  bic text,
  adresse text,
  code_postal text,
  ville text,
  telephone text,
  email text,
  ape text,
  tva_intracommunautaire text,
  capital text,
  nom_banque text,
  adresse_banque text,
  created_at timestamptz default now()
);

alter table societe enable row level security;


-- 2. SOCIETE MEMBRES ──────────────────────────────────────────

create table societe_membres (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid references societe(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz default now(),
  unique(societe_id, user_id)
);

alter table societe_membres enable row level security;


-- 3. HELPER FUNCTIONS ─────────────────────────────────────────

create or replace function get_my_societe_ids()
returns setof uuid
language sql security definer stable
as $$
  select id from societe where owner_id = auth.uid()
  union
  select societe_id from societe_membres where user_id = auth.uid();
$$;

create or replace function can_edit_societe(sid uuid)
returns boolean
language sql security definer stable
as $$
  select exists(
    select 1 from societe where id = sid and owner_id = auth.uid()
  ) or exists(
    select 1 from societe_membres
    where societe_id = sid and user_id = auth.uid() and role in ('admin', 'editor')
  );
$$;

create or replace function is_admin_of_societe(sid uuid)
returns boolean
language sql security definer stable
as $$
  select exists(
    select 1 from societe where id = sid and owner_id = auth.uid()
  ) or exists(
    select 1 from societe_membres
    where societe_id = sid and user_id = auth.uid() and role = 'admin'
  );
$$;


-- 4. SOCIETE RLS POLICIES ────────────────────────────────────

create policy "Members can view their societes"
  on societe for select
  using (id in (select get_my_societe_ids()));

create policy "Authenticated users can create societes"
  on societe for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update their societes"
  on societe for update
  using (owner_id = auth.uid());

create policy "Owners can delete their societes"
  on societe for delete
  using (owner_id = auth.uid());


-- 5. SOCIETE MEMBRES RLS ─────────────────────────────────────

create policy "Members can view members of their societes"
  on societe_membres for select
  using (societe_id in (select get_my_societe_ids()));

create policy "Admins can add members"
  on societe_membres for insert
  with check (is_admin_of_societe(societe_id));

create policy "Admins can update members"
  on societe_membres for update
  using (is_admin_of_societe(societe_id));

create policy "Admins can remove members"
  on societe_membres for delete
  using (is_admin_of_societe(societe_id));


-- 6. BIENS ────────────────────────────────────────────────────

create table biens (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid references societe(id) on delete cascade not null,
  reference text,
  adresse text not null,
  ville text not null,
  code_postal text,
  latitude numeric,
  longitude numeric,
  surface_rdc numeric,
  surface_sous_sol numeric,
  type text default 'Commercial' check (type in ('Commercial', 'Habitation', 'Mixte')),
  activite text,
  type_bail text default 'commercial',
  attribution_charges text,
  indexation text default 'ILC',
  prix_achat numeric,
  apport numeric,
  montant_emprunt numeric,
  duree_credit integer,
  decalage_pret integer,
  loyer_mensuel numeric,
  charges numeric,
  annuites numeric,
  date_acquisition date,
  presence_extraction boolean default false,
  taxe_fonciere numeric,
  statut_bien text default 'Actif',
  created_at timestamptz default now()
);

alter table biens enable row level security;

create policy "Members can view biens"
  on biens for select using (societe_id in (select get_my_societe_ids()));
create policy "Editors can insert biens"
  on biens for insert with check (can_edit_societe(societe_id));
create policy "Editors can update biens"
  on biens for update using (can_edit_societe(societe_id));
create policy "Editors can delete biens"
  on biens for delete using (can_edit_societe(societe_id));


-- 7. LOCATAIRES ───────────────────────────────────────────────

create table locataires (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid references societe(id) on delete cascade not null,
  raison_sociale text,
  prenom text,
  nom text,
  email text,
  telephone text,
  adresse text,
  code_postal text,
  ville text,
  created_at timestamptz default now()
);

alter table locataires enable row level security;

create policy "Members can view locataires"
  on locataires for select using (societe_id in (select get_my_societe_ids()));
create policy "Editors can insert locataires"
  on locataires for insert with check (can_edit_societe(societe_id));
create policy "Editors can update locataires"
  on locataires for update using (can_edit_societe(societe_id));
create policy "Editors can delete locataires"
  on locataires for delete using (can_edit_societe(societe_id));


-- 8. BAUX ─────────────────────────────────────────────────────

create table baux (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid references societe(id) on delete cascade not null,
  bien_id uuid references biens(id) on delete cascade not null,
  locataire_id uuid references locataires(id) on delete cascade not null,
  date_debut date,
  date_fin date,
  loyer_ht numeric not null default 0,
  loyer_an1 numeric,
  loyer_an2 numeric,
  charges numeric default 0,
  depot numeric default 0,
  type_bail text default 'commercial',
  utilisation text,
  indice_revision text default 'ILC',
  date_revision_anniversaire date,
  actif boolean default true,
  created_at timestamptz default now()
);

alter table baux enable row level security;

create policy "Members can view baux"
  on baux for select using (societe_id in (select get_my_societe_ids()));
create policy "Editors can insert baux"
  on baux for insert with check (can_edit_societe(societe_id));
create policy "Editors can update baux"
  on baux for update using (can_edit_societe(societe_id));
create policy "Editors can delete baux"
  on baux for delete using (can_edit_societe(societe_id));


-- 9. TRANSACTIONS ─────────────────────────────────────────────

create table transactions (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid references societe(id) on delete cascade not null,
  bail_id uuid references baux(id) on delete cascade not null,
  mois integer not null check (mois between 0 and 11),
  annee integer not null,
  montant_loyer numeric not null default 0,
  montant_charges numeric not null default 0,
  statut text default 'en_attente' check (statut in ('payé', 'impayé', 'en_attente')),
  date_paiement date,
  relance_count integer default 0,
  created_at timestamptz default now(),
  unique(bail_id, mois, annee)
);

alter table transactions enable row level security;

create policy "Members can view transactions"
  on transactions for select using (societe_id in (select get_my_societe_ids()));
create policy "Editors can insert transactions"
  on transactions for insert with check (can_edit_societe(societe_id));
create policy "Editors can update transactions"
  on transactions for update using (can_edit_societe(societe_id));
create policy "Editors can delete transactions"
  on transactions for delete using (can_edit_societe(societe_id));


-- 10. DOCUMENTS ───────────────────────────────────────────────

create table documents (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid references societe(id) on delete cascade not null,
  bien_id uuid references biens(id) on delete cascade not null,
  type text default 'bail',
  nom text not null,
  fichier_url text,
  taille bigint,
  created_at timestamptz default now()
);

alter table documents enable row level security;

create policy "Members can view documents"
  on documents for select using (societe_id in (select get_my_societe_ids()));
create policy "Editors can insert documents"
  on documents for insert with check (can_edit_societe(societe_id));
create policy "Editors can update documents"
  on documents for update using (can_edit_societe(societe_id));
create policy "Editors can delete documents"
  on documents for delete using (can_edit_societe(societe_id));


-- 11. INDEXES ─────────────────────────────────────────────────

create index idx_societe_owner on societe(owner_id);
create index idx_membres_user on societe_membres(user_id);
create index idx_membres_societe on societe_membres(societe_id);
create index idx_biens_societe on biens(societe_id);
create index idx_locataires_societe on locataires(societe_id);
create index idx_baux_societe on baux(societe_id);
create index idx_baux_bien on baux(bien_id);
create index idx_baux_locataire on baux(locataire_id);
create index idx_transactions_societe on transactions(societe_id);
create index idx_transactions_bail on transactions(bail_id);
create index idx_documents_societe on documents(societe_id);
create index idx_documents_bien on documents(bien_id);


-- 12. STORAGE BUCKET ──────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload"
  on storage.objects for insert
  with check (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "Authenticated users can view"
  on storage.objects for select
  using (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "Authenticated users can delete"
  on storage.objects for delete
  using (bucket_id = 'documents' and auth.role() = 'authenticated');
