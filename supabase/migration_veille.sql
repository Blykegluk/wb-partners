-- ═══════════════════════════════════════════════════════════════
-- Veille immobilière : opportunites, commentaires, runs
-- Appliquée le 2026-07-07 (migrations : veille_immo_opportunites,
-- commentaires_auteur_fk_profiles)
-- ═══════════════════════════════════════════════════════════════

create table public.opportunites (
  id uuid primary key default gen_random_uuid(),
  cle_unique text unique not null,
  recherche text not null check (recherche in ('R1','R2','R3')),
  adresse text,
  ville text,
  code_postal text,
  type_offre text,
  occupation text,
  surface_totale numeric,
  surface_detail text,
  surface_ponderee numeric,
  prix numeric,
  loyer_annuel numeric,
  prix_m2 numeric,
  rendement_brut numeric,
  ratio_cle text,
  score int check (score between 0 and 100),
  score_detail jsonb,
  justification_score text,
  points_forts text,
  points_vigilance text,
  verdict_reglementaire text,
  analyse_concurrence jsonb,
  ca_potentiel jsonb,
  locataire text,
  bail text,
  garanties text,
  source text,
  lien text not null,
  date_publication_annonce date,
  statut text not null default 'active' check (statut in ('active','expiree','a_visiter','offre_deposee','en_nego','abandonnee','signee')),
  detecte_le timestamptz not null default now(),
  verifie_le timestamptz
);

create index opportunites_recherche_idx on public.opportunites (recherche);
create index opportunites_statut_idx on public.opportunites (statut);
create index opportunites_score_idx on public.opportunites (score desc);

create table public.commentaires (
  id uuid primary key default gen_random_uuid(),
  opportunite_id uuid not null references public.opportunites(id) on delete cascade,
  auteur uuid references public.profiles(id) on delete set null,
  contenu text not null,
  cree_le timestamptz not null default now()
);

create index commentaires_opportunite_idx on public.commentaires (opportunite_id);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  date_run timestamptz not null default now(),
  requetes jsonb,
  annonces_analysees int,
  nouvelles int,
  expirees int,
  erreurs text
);

-- ── RLS ─────────────────────────────────────────────────────────
alter table public.opportunites enable row level security;
alter table public.commentaires enable row level security;
alter table public.runs enable row level security;

-- Rien pour anon ; lecture pour authenticated ;
-- écriture opportunites/runs réservée au service_role (bypasse la RLS).
revoke all on public.opportunites from anon, authenticated;
revoke all on public.commentaires from anon, authenticated;
revoke all on public.runs from anon, authenticated;

grant select on public.opportunites to authenticated;
grant update (statut) on public.opportunites to authenticated;
grant select on public.runs to authenticated;
grant select, insert on public.commentaires to authenticated;
grant update, delete on public.commentaires to authenticated;

create policy "opportunites_select_authenticated" on public.opportunites
  for select to authenticated using (true);

-- Le privilège colonne ci-dessus limite cette policy à la seule colonne statut
create policy "opportunites_update_statut_authenticated" on public.opportunites
  for update to authenticated using (true) with check (true);

create policy "runs_select_authenticated" on public.runs
  for select to authenticated using (true);

create policy "commentaires_select_authenticated" on public.commentaires
  for select to authenticated using (true);

create policy "commentaires_insert_own" on public.commentaires
  for insert to authenticated with check (auteur = auth.uid());

create policy "commentaires_update_own" on public.commentaires
  for update to authenticated using (auteur = auth.uid()) with check (auteur = auth.uid());

create policy "commentaires_delete_own" on public.commentaires
  for delete to authenticated using (auteur = auth.uid());
