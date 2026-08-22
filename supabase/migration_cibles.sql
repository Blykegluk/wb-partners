-- ═══════════════════════════════════════════════════════════════
-- Sourcing propriétaire : cibles à démarcher (≠ opportunites, qui
-- sont des annonces publiées). Appliquée le 2026-08-21 (migrations :
-- cibles_sourcing_proprietaire).
--
-- Première famille (`type = 'supermarche_dirigeant'`) : supermarchés et
-- supérettes PME d'Île-de-France et de PACA dont le dirigeant EFFECTIF a
-- 60 ans ou plus. Dirigeant effectif = gérant / président / DG personne
-- physique de la société d'exploitation ; si la présidence est tenue par
-- une personne morale, la holding est résolue et c'est SON dirigeant
-- personne physique qui compte. Les commissaires aux comptes et membres
-- de conseils ne comptent jamais. Holding de catégorie ETI ou GE =
-- filiale/franchise intégrée d'un gros groupe : exclue.
--
-- Alimentée par veille/cibles/collecte_supermarches_60plus.py
-- (API publique recherche-entreprises.api.gouv.fr, rafraîchissement
-- mensuel recommandé). Le score /100 et son détail sont recalculés en
-- SQL après insertion — voir le bloc UPDATE en fin de fichier.
-- ═══════════════════════════════════════════════════════════════

create table public.cibles (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'supermarche_dirigeant',
  siren text not null,
  denomination text not null,
  naf text,
  region text,
  ville text,
  code_postal text,
  adresse text,
  nb_etablissements int,
  effectif text,                     -- tranche INSEE ('11' = 10-19, '12' = 20-49…)
  date_creation date,
  dirigeant_nom text,
  dirigeant_naissance text,          -- AAAA-MM (précision du registre)
  dirigeant_qualite text,
  via_holding text,                  -- dénomination de la holding si la direction est remontée
  releve_possible boolean not null default false,  -- co-dirigeant né après 1981
  co_dirigeants jsonb,               -- [{n: nom, d: AAAA-MM, q: qualité}]
  ca numeric,
  resultat numeric,
  annee_finances text,
  score int check (score between 0 and 100),
  score_detail jsonb,
  statut text not null default 'a_qualifier'
    check (statut in ('a_qualifier','a_contacter','contactee','en_discussion','ecartee')),
  notes text,
  lien text,                         -- fiche annuaire-entreprises.data.gouv.fr
  detecte_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  unique (type, siren)
);
create index cibles_type_idx on public.cibles (type);
create index cibles_statut_idx on public.cibles (statut);
create index cibles_score_idx on public.cibles (score desc);

create table public.cibles_commentaires (
  id uuid primary key default gen_random_uuid(),
  cible_id uuid not null references public.cibles(id) on delete cascade,
  auteur uuid references public.profiles(id) on delete set null,
  contenu text not null,
  cree_le timestamptz not null default now()
);
create index cibles_commentaires_cible_idx on public.cibles_commentaires (cible_id);

-- ── RLS ─────────────────────────────────────────────────────────
alter table public.cibles enable row level security;
alter table public.cibles_commentaires enable row level security;
revoke all on public.cibles from anon, authenticated;
revoke all on public.cibles_commentaires from anon, authenticated;
grant select on public.cibles to authenticated;
grant update (statut, notes) on public.cibles to authenticated;
grant select, insert on public.cibles_commentaires to authenticated;
grant update, delete on public.cibles_commentaires to authenticated;

create policy "cibles_select_authenticated" on public.cibles
  for select to authenticated using (true);
create policy "cibles_update_authenticated" on public.cibles
  for update to authenticated using (true) with check (true);
create policy "cibles_com_select" on public.cibles_commentaires
  for select to authenticated using (true);
create policy "cibles_com_insert_own" on public.cibles_commentaires
  for insert to authenticated with check (auteur = auth.uid());
create policy "cibles_com_update_own" on public.cibles_commentaires
  for update to authenticated using (auteur = auth.uid()) with check (auteur = auth.uid());
create policy "cibles_com_delete_own" on public.cibles_commentaires
  for delete to authenticated using (auteur = auth.uid());

-- ── Score de transmissibilité /100, recalculé après chaque collecte ──
-- Un critère non documenté est noté au plancher, jamais inventé.
-- À exécuter après insertion (remplacer l'année 2026 et la date pivot) :
--
-- with calc as (
--   select id,
--     case when 2026 - substr(dirigeant_naissance,1,4)::int < 65 then 15
--          when 2026 - substr(dirigeant_naissance,1,4)::int < 70 then 22
--          when 2026 - substr(dirigeant_naissance,1,4)::int < 75 then 27
--          else 30 end as p_age,                                    -- âge du dirigeant effectif (30)
--     case when releve_possible then 5 else 25 end as p_rel,        -- absence de relève identifiée (25)
--     case when date_creation <= (current_date - interval '20 years') then 15
--          when date_creation <= (current_date - interval '10 years') then 10
--          else 5 end as p_anc,                                     -- ancienneté de la société (15)
--     case when ca between 2000000 and 20000000 then 15
--          when ca > 20000000 then 10 else 5 end as p_ca,           -- taille — CA connu (15)
--     case when effectif in ('12','21','22','31','32') then 10
--          when effectif = '11' then 8 else 3 end as p_eff,         -- effectif salarié (10)
--     case when coalesce(nb_etablissements,1) >= 2 then 5 else 3 end as p_multi  -- multi-établissements (5)
--   from cibles where type = 'supermarche_dirigeant'
-- )
-- update cibles c set
--   score = calc.p_age + calc.p_rel + calc.p_anc + calc.p_ca + calc.p_eff + calc.p_multi,
--   score_detail = jsonb_build_object(
--     'âge du dirigeant effectif (30)', calc.p_age,
--     'absence de relève identifiée (25)', calc.p_rel,
--     'ancienneté de la société (15)', calc.p_anc,
--     'taille — CA connu (15)', calc.p_ca,
--     'effectif salarié (10)', calc.p_eff,
--     'multi-établissements (5)', calc.p_multi),
--   lien = 'https://annuaire-entreprises.data.gouv.fr/entreprise/' || c.siren
-- from calc where c.id = calc.id;

-- ── Score d'acquisibilité /100 — famille « reseau_bio » ──────────────
-- La transmissibilité ne dit rien d'un réseau bio : ce qu'on y cherche, c'est
-- un maillage repris d'un bloc. Barème distinct, appliqué pour la première
-- fois au réseau PROVISENS le 22/08/2026 :
--
--   taille atteignable — 3 à 10 magasins (25)   au-delà, hors de portée ;
--                                               en deçà, ce n'est pas un réseau
--   cohérence géographique du maillage (20)     logistique et zone de chalandise communes
--   indépendance capitalistique (15)            0 pour une coopérative ou un
--                                               adhérent lié à sa centrale
--   absence de relève identifiée (15)           déclencheur de cession
--   rentabilité documentée (15)                 résultats publiés positifs
--   chiffre d'affaires publié (10)              0 si comptes confidentiels
--
-- Les 15 réseaux versés par l'étude d'août 2026 portent encore des scores
-- d'appréciation antérieurs à ce barème (38 à 75) : ils sont à recalculer sur
-- cette grille à la prochaine passe de collecte bio, sans quoi les deux séries
-- ne se comparent pas.
