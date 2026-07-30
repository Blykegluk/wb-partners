-- ═══════════════════════════════════════════════════════════════
-- Veille immobilière : relais de récupération de pages web
-- Appliquée le 2026-07-30 (migrations : veille_relais_fetch,
-- veille_relais_fetch_corrections, veille_relais_drop_ancienne_signature)
--
-- POURQUOI
-- L'environnement d'exécution planifié (Claude Code cloud) n'a pas
-- d'accès réseau sortant : WebFetch y renvoie 403 sur *tous* les
-- domaines, y compris example.com et api-adresse.data.gouv.fr. Les runs
-- des 29 et 30/07/2026 se sont donc arrêtés sans rien insérer, alors que
-- les runs lancés depuis un poste local fonctionnaient.
--
-- Supabase, lui, sort sur Internet sans restriction (vérifié le
-- 30/07/2026 : géocodage 200, et 4 des 5 portails ouverts rendus en
-- texte lisible). Et le connecteur MCP Supabase reste joignable même
-- quand l'egress du conteneur est coupé — c'est ce qui a permis aux runs
-- bloqués de journaliser leur échec dans `runs`.
--
-- Ce relais fait donc transiter les récupérations de pages par la base :
-- Postgres appelle l'URL via pg_net, nettoie le HTML, et le run lit le
-- texte par `execute_sql`. Plus aucune dépendance à l'egress du conteneur.
--
-- USAGE — deux appels `execute_sql` distincts, obligatoirement
--   1) select * from veille_fetch_start(array['https://…','https://…']);
--   2) select * from veille_fetch_result(array[<ids renvoyés>]);
-- pg_net n'émet la requête qu'après le COMMIT de la transaction qui l'a
-- mise en file : tout faire dans un seul appel attendrait indéfiniment.
-- Si `etat` vaut encore 'en_attente', refaire l'appel (2) — compter une à
-- deux secondes par page, davantage pour un portail lent.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create table if not exists public.veille_fetch (
  id          bigint primary key generated always as identity,
  url         text not null,
  request_id  bigint not null,
  demande_le  timestamptz not null default now()
);

create index if not exists veille_fetch_demande_le_idx on public.veille_fetch (demande_le desc);

-- Table de travail interne au pipeline : rien pour les clients du site.
alter table public.veille_fetch enable row level security;
revoke all on public.veille_fetch from anon, authenticated;

-- ── HTML → texte lisible ────────────────────────────────────────
-- Volontairement grossier : on ne cherche pas à rendre la page, mais à
-- donner à l'analyste de quoi lire un prix, une surface, une adresse.
--
-- ATTENTION au piège de regex qui a coûté une itération ici : dans le
-- moteur de Postgres, la préférence (gourmand / non gourmand) vaut pour
-- la branche entière et se lit sur le PREMIER atome quantifié. Écrit
-- `<script[^>]*>.*?</script>`, le `[^>]*` gourmand rend le `.*?` gourmand
-- lui aussi : la substitution part du premier `<script` et va jusqu'au
-- DERNIER `</script>`, ce qui avalait 61 Ko de page pour n'en laisser
-- que 172 octets. D'où `[^>]*?` en tête de chaque motif.
-- Une alternation avec référence arrière (`<(script|style)…</\1>`)
-- reproduit le même effondrement : on traite donc chaque balise à part.
create or replace function public.veille_html_texte(p_html text)
returns text
language plpgsql
immutable
as $fn$
declare
  v text;
  m text[];
begin
  v := p_html;
  v := regexp_replace(v, '(?is)<script[^>]*?>.*?</script>', ' ', 'g');
  v := regexp_replace(v, '(?is)<style[^>]*?>.*?</style>', ' ', 'g');
  v := regexp_replace(v, '(?is)<noscript[^>]*?>.*?</noscript>', ' ', 'g');
  v := regexp_replace(v, '(?is)<svg[^>]*?>.*?</svg>', ' ', 'g');
  v := regexp_replace(v, '(?is)<iframe[^>]*?>.*?</iframe>', ' ', 'g');
  v := regexp_replace(v, '(?is)<!--.*?-->', ' ', 'g');
  v := regexp_replace(v, '(?is)<[^>]+>', ' ', 'g');

  for m in select distinct x from regexp_matches(v, '&#x([0-9a-fA-F]{1,6});', 'g') x loop
    v := replace(v, '&#x' || m[1] || ';', chr(('x' || lpad(m[1], 8, '0'))::bit(32)::int));
  end loop;
  for m in select distinct x from regexp_matches(v, '&#([0-9]{1,7});', 'g') x loop
    v := replace(v, '&#' || m[1] || ';', chr(m[1]::int));
  end loop;

  v := replace(v, '&nbsp;', ' ');
  v := replace(v, '&amp;', '&');
  v := replace(v, '&quot;', '"');
  v := replace(v, '&lt;', '<');
  v := replace(v, '&gt;', '>');
  v := replace(v, '&euro;', '€');
  v := replace(v, '&eacute;', 'é');
  v := replace(v, '&egrave;', 'è');
  v := replace(v, '&agrave;', 'à');
  v := replace(v, '&ccedil;', 'ç');
  v := replace(v, '&rsquo;', '''');

  return btrim(regexp_replace(v, '[[:space:]]+', ' ', 'g'));
end;
$fn$;

-- ── 1) Mise en file ─────────────────────────────────────────────
-- p_headers est vide par défaut, et c'est délibéré : Geolocaux renvoie
-- « 400 Invalid Header » dès qu'un en-tête personnalisé est présent, y
-- compris un simple User-Agent. Sans en-tête, il répond 200. Ne
-- renseigner p_headers que pour un site qui l'exige vraiment.
create or replace function public.veille_fetch_start(p_urls text[], p_headers jsonb default '{}'::jsonb)
returns table (id bigint, url text)
language plpgsql
security definer
set search_path = public, net, pg_temp
as $fn$
declare
  v_url text;
  v_req bigint;
  v_id  bigint;
begin
  foreach v_url in array p_urls loop
    select net.http_get(url := v_url, headers := p_headers, timeout_milliseconds := 20000)
      into v_req;

    insert into public.veille_fetch (url, request_id)
    values (v_url, v_req)
    returning veille_fetch.id into v_id;

    id := v_id; url := v_url;
    return next;
  end loop;
end;
$fn$;

-- ── 2) Lecture du résultat ──────────────────────────────────────
-- `etat` vaut 'ok' (page lue), 'en_attente' (pg_net n'a pas encore
-- répondu — refaire l'appel), ou 'erreur' (DNS, TLS, timeout).
-- `status_code` 403/404/… est une réponse, pas une erreur de transport :
-- c'est le portail qui refuse, exactement comme en local.
create or replace function public.veille_fetch_result(p_ids bigint[], p_max int default 20000)
returns table (
  id          bigint,
  url         text,
  etat        text,
  status_code int,
  taille      int,
  texte       text,
  erreur      text
)
language sql
security definer
set search_path = public, net, pg_temp
as $fn$
  select
    f.id,
    f.url,
    case
      when r.id is null and e.id is null then 'en_attente'
      when e.id is not null then 'erreur'
      else 'ok'
    end                                                as etat,
    r.status_code,
    length(coalesce(r.content, ''))                    as taille,
    left(public.veille_html_texte(coalesce(r.content, '')), p_max) as texte,
    e.error_msg                                        as erreur
  from public.veille_fetch f
  left join net._http_response r on r.id = f.request_id and r.error_msg is null
  left join net._http_response e on e.id = f.request_id and e.error_msg is not null
  where f.id = any(p_ids)
  order by f.id;
$fn$;

-- ── Géocodage, même chemin ──────────────────────────────────────
-- L'étape 4bis du brief appelle api-adresse.data.gouv.fr, elle aussi
-- inatteignable depuis le conteneur. Renvoie directement lat/lng.
create or replace function public.veille_geocode_result(p_ids bigint[])
returns table (id bigint, url text, etat text, latitude numeric, longitude numeric, label text)
language sql
security definer
set search_path = public, net, pg_temp
as $fn$
  select
    f.id,
    f.url,
    case when r.id is null then 'en_attente' else 'ok' end as etat,
    ((r.content::jsonb -> 'features' -> 0 -> 'geometry' -> 'coordinates' ->> 1)::numeric) as latitude,
    ((r.content::jsonb -> 'features' -> 0 -> 'geometry' -> 'coordinates' ->> 0)::numeric) as longitude,
    (r.content::jsonb -> 'features' -> 0 -> 'properties' ->> 'label') as label
  from public.veille_fetch f
  left join net._http_response r on r.id = f.request_id and r.status_code = 200
  where f.id = any(p_ids)
  order by f.id;
$fn$;

-- ── Purge ───────────────────────────────────────────────────────
-- pg_net purge lui-même net._http_response ; on suit le même rythme pour
-- ne pas garder d'index vers des réponses disparues.
create or replace function public.veille_fetch_purge()
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  delete from public.veille_fetch where demande_le < now() - interval '2 days';
$fn$;
