-- Veille BODACC — planification (documentation de l'existant)
--
-- Ce fichier ne crée rien de neuf : il consigne un mécanisme qui tournait
-- depuis des semaines sans trace dans le dépôt. La fonction Edge
-- `veille-bodacc` et le job pg_cron qui l'appelle ont été déployés hors
-- versionnage ; ni l'un ni l'autre n'était relisible depuis le code, alors
-- qu'ils écrivent chaque passage dans `opportunites` et dans `runs`.
--
-- Ce que fait la fonction : elle interroge l'API BODACC (annonces
-- commerciales, familles « collective » et « ventes », départements 75/92/93/94
-- sur une fenêtre glissante de 3 jours), retient les libellés qui contiennent
-- un mot-clé alimentaire, et insère les lignes retenues en `recherche='R5'`.
-- Elle crée aussi la ligne `runs` du jour, que l'agent de veille complète
-- ensuite.
--
-- RÉSERVE CONNUE — la fonction insère SANS appliquer les trois filtres
-- cumulatifs de R5 définis dans veille/CLAUDE.md (zone, nature du jugement,
-- activité compatible), avec un score fictif de 50. L'agent de veille doit
-- donc repasser ces lignes dans les filtres et expirer celles qui ne passent
-- pas — il le signale dans son rapport à chaque run (3 lignes écartées le
-- 11/09/2026 : épicerie fine, restauration, restauration rapide). La
-- correction propre serait de filtrer avant insertion, ou d'écrire dans une
-- table de transit plutôt que directement dans `opportunites`.

select cron.unschedule('veille-bodacc-quotidienne')
where exists (select 1 from cron.job where jobname = 'veille-bodacc-quotidienne');

-- 04:30 UTC, une heure et demie avant la routine de veille (06:00 UTC) et les
-- mêmes jours qu'elle : le cadencement `*/3` sur le quantième fait tomber les
-- deux sur 1, 4, 7, 10… du mois. L'agent trouve ainsi les lignes BODACC du
-- jour déjà posées, et les nettoie dans la foulée au lieu de les laisser
-- visibles dans l'application jusqu'au passage suivant.
--
-- Le nom du job garde le suffixe « quotidienne » de sa création : le renommer
-- imposerait de le recréer, donc de perdre son historique d'exécutions.
select cron.schedule(
  'veille-bodacc-quotidienne',
  '30 4 */3 * *',
  $$
  SELECT net.http_post(
    url := 'https://zokdctiqmbfnoahhebys.supabase.co/functions/v1/veille-bodacc',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <clé de service — voir les secrets du projet>'
    )
  );
  $$
);
