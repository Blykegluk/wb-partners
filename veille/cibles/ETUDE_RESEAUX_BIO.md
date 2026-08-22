# Étude — Réseaux de magasins bio à reprendre (21/08/2026)

Étude ponctuelle demandée le 21/08/2026 : identifier des réseaux de magasins bio
susceptibles d'être repris pour se développer, en Île-de-France ou ailleurs (Sud
en particulier). Résultats versés dans la table `cibles` (type `reseau_bio`),
visibles dans l'onglet **Opportunités → Cibles de reprise** du dashboard.

## Méthode

1. **Annuaire officiel Agence Bio** (opendata, 33 200 opérateurs « distribution ») :
   extraction des magasins spécialisés bio avec SIRET → 6 431 magasins après
   dédoublonnage, 5 756 SIREN distincts. Scripts : `bio_1_annuaire.py`, `bio_2_reseaux.py`.
2. **Reconstitution des réseaux** par SIREN (un opérateur = plusieurs magasins) et
   par enseigne (champ `reseau` de l'annuaire).
3. **Enrichissement** de chaque réseau de 3 magasins et plus via l'API
   recherche-entreprises : dirigeant effectif (mêmes règles que le screening
   supermarchés — gérant/président/DG personne physique, holding résolue, jamais
   les commissaires aux comptes), catégorie d'entreprise, CA et résultat publiés.

## Ce que la donnée dit du secteur

- **Le bio spécialisé n'est presque jamais organisé en petites chaînes intégrées.**
  Sur 5 756 SIREN, **21 seulement** exploitent 3 magasins ou plus. Le secteur est
  fait de groupements d'indépendants (Biocoop 562 magasins ≈ autant de sociétés,
  Biomonde 104/101, La Vie Claire 434 essentiellement en franchise) et de chaînes
  intégrées de grands groupes (Naturalia = 1 SIREN de 175 magasins ; Bio c' Bon /
  So.Bio = 1 SIREN de ~150 magasins).
- Conséquence : « racheter un réseau bio » signifie en pratique soit **racheter un
  multi-franchisé** (2-10 magasins sous un même propriétaire), soit viser l'une
  des **rares chaînes régionales intégrées**, soit **construire le réseau magasin
  par magasin** (et le flux R5/BODACC + le screening supermarchés y pourvoient).

## Cibles retenues (12, versées en base)

| Réseau | Zone | Magasins | Dirigeant effectif | Lecture |
|---|---|---|---|---|
| **Marcel & Fils** (13, Venelles) | tout l'arc Sud | 45 | non publié (à identifier) | L'acteur structurant du Sud. ETI, CA 109 M€, résultat 2024 négatif (-2,3 M€) : hors gabarit PME, un rapprochement plutôt qu'un achat. |
| **Corse Bio Nature / CO BI NA** (2A) | Corse | ~10 (2 SIREN) | P. Cristin, 59 ans | PME familiale, la cible la plus « propre » du lot. |
| **Bio c' Bon IDF + PACA** (Athis-Mons) | IDF + 06/13/30 | 11 | T. Chouraqui, 68 ans | Master-franchisé de 68 ans — les deux sociétés ensemble font un réseau IDF+Sud. Vérifier l'articulation avec la tête de réseau (groupe Carrefour). |
| **Envithes** (74) | 01/73/74 | 3 | couple de gérants 61 et 64 ans | Petit réseau frontalier sans relève identifiée. |
| **La Récolte** (Paris) | 75 | 4 | M. Mulliez, 43 ans | Résultat 2024 : **-2,9 M€** — dossier de détresse potentiel, à suivre côté BODACC plutôt qu'en démarchage classique. |
| Le Pois Tout Vert (86), Scarabée (35), Aquarius (74), GRAP (69) | hors zone | 3-13 | 37-57 ans | Groupements/coopératives : cession atypique (AG des sociétaires), gardés comme repères de marché. |
| Biomonde 2 (42), Boucherie Bio Tourangelle (37) | hors zone | 3 | 54-57 ans | Petits, hors zone ou format tangent. |

## Limites, à garder en tête

- L'annuaire Agence Bio est déclaratif : le nombre de magasins par SIREN est un
  plancher (certifications manquantes ou SIRET absents).
- Les multi-franchisés de 2 magasins (nombreux dans le Sud : La Vie Claire Lattes,
  Biocoop Marseille, SO BIO 11/84…) n'ont pas été enrichis — deuxième passe possible
  si la piste principale s'épuise.
- Le contexte sectoriel (sortie de trois années de purge du bio) rend plusieurs de
  ces dossiers négociables en dessous de leur coût de reconstruction — les résultats
  négatifs de Marcel & Fils et de La Récolte vont dans ce sens ; l'inverse (regain
  du secteur) rendrait les vendeurs plus chers. À réévaluer au moment du contact.

## Rafraîchissement

Relancer `bio_1_annuaire.py` puis `bio_2_reseaux.py` (annuaire + API publiques,
sans clé), réinsérer via le même canal que le screening supermarchés. Cadence
raisonnable : trimestrielle.
