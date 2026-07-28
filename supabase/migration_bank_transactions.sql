-- Persistance des données bancaires agrégées via Bridge (Phase 1)
--
-- Jusqu'ici bank-sync récupérait les mouvements, les comparait en mémoire
-- puis les jetait : aucun historique, aucun écran possible, aucun moyen de
-- savoir pourquoi une échéance avait été marquée payée.
--
-- Une société peut détenir plusieurs comptes (le sandbox en expose 6, dont
-- un en GBP et deux cartes) : on les modélise explicitement au lieu de n'en
-- retenir qu'un seul comme le faisait bank-callback.

create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references societe(id) on delete cascade,
  bridge_account_id bigint not null,
  bridge_item_id bigint,
  nom text,
  iban text,
  type text,                                  -- checking, savings, card...
  devise text default 'EUR',
  solde numeric,
  actif boolean default true,                 -- false si paused / accès révoqué
  -- Exclut le compte du rapprochement et des totaux sans le supprimer
  -- (comptes en devise étrangère, comptes personnels...).
  suivi boolean default true,
  derniere_maj timestamptz,
  created_at timestamptz default now(),
  unique (societe_id, bridge_account_id)
);

create index if not exists idx_bank_accounts_societe on bank_accounts(societe_id);

create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  societe_id uuid not null references societe(id) on delete cascade,
  bank_account_id uuid references bank_accounts(id) on delete cascade,
  bridge_transaction_id bigint not null,
  bridge_account_id bigint,

  date date not null,                         -- date de valeur retenue
  booking_date date,
  value_date date,

  montant numeric not null,                   -- signé : + crédit, − débit
  devise text default 'EUR',

  libelle text,                               -- clean_description
  libelle_brut text,                          -- provider_description
  categorie_id integer,
  operation_type text,                        -- transfer, card, direct_debit...
  future boolean default false,
  supprime boolean default false,             -- Bridge signale les annulations

  -- Rapprochement
  statut_rapprochement text not null default 'a_qualifier',
  transaction_id uuid references transactions(id) on delete set null,
  score_confiance numeric,
  rapproche_le timestamptz,
  rapproche_par uuid references auth.users(id) on delete set null,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (societe_id, bridge_transaction_id),
  constraint bank_transactions_statut_check check (
    statut_rapprochement in ('a_qualifier', 'rapproche_auto', 'rapproche_manuel', 'ignore')
  )
);

create index if not exists idx_bank_tx_societe on bank_transactions(societe_id);
create index if not exists idx_bank_tx_compte on bank_transactions(bank_account_id);
create index if not exists idx_bank_tx_statut on bank_transactions(societe_id, statut_rapprochement);
create index if not exists idx_bank_tx_date on bank_transactions(societe_id, date desc);
create index if not exists idx_bank_tx_echeance on bank_transactions(transaction_id);

alter table bank_accounts enable row level security;
alter table bank_transactions enable row level security;

-- Mêmes règles que le reste des données de société.
create policy "Members can view bank_accounts"
  on bank_accounts for select using (societe_id in (select get_my_societe_ids()));
create policy "Editors can insert bank_accounts"
  on bank_accounts for insert with check (can_edit_societe(societe_id));
create policy "Editors can update bank_accounts"
  on bank_accounts for update using (can_edit_societe(societe_id));
create policy "Editors can delete bank_accounts"
  on bank_accounts for delete using (can_edit_societe(societe_id));

create policy "Members can view bank_transactions"
  on bank_transactions for select using (societe_id in (select get_my_societe_ids()));
create policy "Editors can insert bank_transactions"
  on bank_transactions for insert with check (can_edit_societe(societe_id));
create policy "Editors can update bank_transactions"
  on bank_transactions for update using (can_edit_societe(societe_id));
create policy "Editors can delete bank_transactions"
  on bank_transactions for delete using (can_edit_societe(societe_id));
