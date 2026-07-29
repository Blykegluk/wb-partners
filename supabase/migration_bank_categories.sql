-- Qualification des mouvements hors loyer
--
-- Le rapprochement ne savait faire qu'une chose : pointer un virement contre
-- une échéance de loyer. Or une bonne part des mouvements d'une société
-- immobilière n'en sont pas — indemnité de résiliation, dépôt de garantie,
-- apport en compte courant, travaux, taxe foncière. Faute de pouvoir les
-- qualifier, il ne restait qu'à les ignorer, ce qui revient à dire qu'ils ne
-- comptent pas : trompeur pour un virement de plusieurs dizaines de milliers
-- d'euros.
--
-- On distingue donc « ignoré » (le mouvement ne concerne pas le suivi) de
-- « classé » (il est qualifié par sa nature, sans échéance en face).

alter table bank_transactions
  add column if not exists categorie text,
  add column if not exists bien_id uuid references biens(id) on delete set null,
  add column if not exists note text;

alter table bank_transactions drop constraint if exists bank_transactions_statut_check;
alter table bank_transactions add constraint bank_transactions_statut_check
  check (statut_rapprochement in (
    'a_qualifier', 'rapproche_auto', 'rapproche_manuel', 'qualifie', 'ignore'
  ));

create index if not exists idx_bank_tx_categorie
  on bank_transactions(societe_id, categorie);
create index if not exists idx_bank_tx_bien
  on bank_transactions(bien_id);
