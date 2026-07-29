-- Assujettissement à la TVA du bail.
--
-- L'échéancier est tenu en HT, la banque encaisse du TTC : sans ce taux, un
-- bail assujetti ne peut jamais être rapproché — 8 500 attendus contre 10 200
-- reçus, soit 20 % d'écart, très au-delà de toute tolérance.
--
-- Défaut à « applicable, 20 % » : c'est ce que l'application supposait déjà
-- partout (balance TVA), et tous les baux existants sont commerciaux.
alter table baux
  add column if not exists tva_applicable boolean not null default true,
  add column if not exists taux_tva numeric not null default 20;

-- Motif d'un écart entre le virement et l'échéance : régularisation de
-- charges, indexation, paiement partiel. Sans lui, l'écran Écarts signale
-- une anomalie là où il n'y a qu'une explication connue.
alter table bank_transactions
  add column if not exists motif_ecart text;
