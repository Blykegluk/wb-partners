-- ═══════════════════════════════════════════════════════════════
-- Apprentissage des catégories bancaires par émetteur
-- Appliquée le 2026-08-04 (migration : categorisation_apprise)
--
-- L'utilisateur avait classé une dizaine de mouvements à la main ; rien
-- n'en était retenu, et chaque synchronisation ramenait les mêmes
-- émetteurs en « à qualifier ». Ce dispositif, entièrement en base :
--   1. apprend — un trigger mémorise l'empreinte du libellé à chaque
--      classement manuel (categorisation_apprise) ;
--   2. applique — un trigger BEFORE INSERT classe d'office tout nouveau
--      mouvement dont l'émetteur est connu, avec une note explicite.
-- Aucun déploiement de fonction Edge n'est nécessaire : la synchro
-- quotidienne insère, les triggers font le reste, pour toutes les
-- sociétés.
--
-- L'empreinte réplique _shared/rapprochement.ts : jetons >= 3 caractères,
-- sans nombres purs ni mots vides, dédoublonnés et triés — stable face aux
-- dates et références variables, discriminante par les identifiants SEPA.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists unaccent;

create or replace function public.empreinte_libelle(s text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    (select string_agg(t, ' ' order by t) from (
      select distinct t from unnest(
        string_to_array(
          trim(regexp_replace(upper(unaccent(coalesce(s, ''))), '[^A-Z0-9]+', ' ', 'g')),
          ' ')
      ) as t
      where length(t) >= 3
        and t !~ '^[0-9]+$'
        and t not in ('VIR','VIREMENT','SEPA','INST','RECU','PRLV','PAIEMENT',
                      'CARTE','REF','REFERENCE','SARL','SAS','SCI','SASU','EURL','LES')
    ) x having count(*) >= 2),
  '');
$$;

create table public.categorisation_apprise (
  societe_id  uuid not null references public.societe(id) on delete cascade,
  empreinte   text not null,
  categorie   text not null,
  occurrences int not null default 1,
  derniere_utilisation timestamptz not null default now(),
  primary key (societe_id, empreinte)
);

alter table public.categorisation_apprise enable row level security;
create policy "Members can view categorisation apprise"
  on public.categorisation_apprise for select
  using (societe_id in (select get_my_societe_ids()));
-- Écritures uniquement par les triggers (security definer) et service_role.

create or replace function public.apprendre_categorie()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  emp text;
begin
  if new.statut_rapprochement = 'qualifie' and new.categorie is not null then
    emp := empreinte_libelle(new.remittance_information);
    if emp <> '' then
      insert into categorisation_apprise (societe_id, empreinte, categorie)
      values (new.societe_id, emp, new.categorie)
      on conflict (societe_id, empreinte) do update set
        categorie = excluded.categorie,
        occurrences = categorisation_apprise.occurrences + 1,
        derniere_utilisation = now();
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_apprendre_categorie
  after insert or update of categorie, statut_rapprochement on public.bank_transactions
  for each row execute function public.apprendre_categorie();

create or replace function public.auto_categoriser()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cat text;
begin
  if new.categorie is null and coalesce(new.statut_rapprochement, 'a_qualifier') = 'a_qualifier' then
    select categorie into cat from categorisation_apprise
    where societe_id = new.societe_id
      and empreinte = empreinte_libelle(new.remittance_information);
    if cat is not null then
      new.categorie := cat;
      new.statut_rapprochement := 'qualifie';
      new.note := coalesce(new.note, 'Catégorisé automatiquement (émetteur appris)');
      new.rapproche_le := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_auto_categoriser
  before insert on public.bank_transactions
  for each row execute function public.auto_categoriser();

-- Amorçage : les classements manuels existants nourrissent la table, puis
-- les mouvements en attente du même émetteur sont classés d'office (fait en
-- données le 2026-08-04 — 19 mouvements CREB classés, un prélèvement
-- « PRET COPROPRIETE » reclassé d'impôts vers échéance de prêt).
