# Analyse de recevabilité — régularisations de charges FIDUCIAL GÉRANCE / FICOMMERCE

**Local** : 132 rue de la Roquette, 75011 Paris (immeuble 10663)
**Preneur** : SAS AEJB — **Bailleur** : SCPI FICOMMERCE — **Gestionnaire** : FIDUCIAL GÉRANCE
**Sommes réclamées** : 11 332,83 € TTC de régularisation (exercices 2021 à 2024) + solde reporté de 10 823,17 €
**Date de l'analyse** : 15 août 2026

> **Avertissement.** Ce document n'est pas une consultation juridique. Il est destiné à préparer un dossier
> pour votre avocat. Les points de droit sont formulés comme des **arguments à faire valider**, jamais comme
> des conclusions acquises.

---

## 0. État des sources — ce qui a pu être exploité, ce qui manque

| Source | Statut | Ce qui en a été tiré |
|---|---|---|
| Bail commercial du 28/06/2019 (16 p. scannées) | ✅ Obtenu et OCRisé (`extraits/BAIL.txt`) | Tantièmes, base de répartition, inventaire des charges, clauses travaux |
| Métadonnées Gmail 2021→2026 | ✅ Exploitées | **Chronologie complète des envois d'états récapitulatifs** |
| « SOLDE CHARGES 2020 » (avoir du 19/12/2025) | ✅ Récupéré via Google Drive (`extraits/SOLDE_CHARGES_2020.txt`) | Format des documents Fiducial, référence de comparaison |
| 5 PDF du solde 2025 (msg `19fad52a9fa37400`) | ❌ **Non récupérés** | — |
| Facture du 05/06/2026, solde antérieur 38 619 € (msg `19e98465072846cf`) | ❌ **Non récupérée** | — |
| Soldes charges 2021 (11/02/2026) et 2022 (17/02/2026) | ❌ **Non récupérés** | — |
| PJ de Sandrine Da Costa du 30/06/2026 (msg `19f1932901779d54`) | ⚠️ Identifiée, non exploitable | Voir § 0.2 |
| Comptabilité AEJB (Pennylane) | ❌ Accès refusé par le plan/rôle | — |

### 0.1 Pourquoi les pièces jointes n'ont pas pu être téléchargées

L'étape 1 du cahier des charges (montage OAuth Gmail) s'est révélée **inutile** : un connecteur Gmail en
lecture seule était déjà actif sur la session, ce qui a permis de lire les messages immédiatement. En
revanche ce connecteur **n'expose aucune fonction de téléchargement de pièce jointe** — uniquement la
lecture des messages et de leurs métadonnées. Les noms, types MIME et identifiants des PJ sont visibles ;
leur contenu binaire ne l'est pas.

Aucun accès navigateur n'est disponible dans cet environnement (session distante isolée, sans connecteur
Claude-in-Chrome), et un téléchargement effectué sur votre poste n'atteindrait pas ce conteneur.

**Deux voies fonctionnent** — voir § 6.

### 0.2 Anomalie sur le « détail des régularisations 2022→2024 »

Le message du 30/06/2026 de Sandrine Da Costa (`19f1932901779d54`), annoncé comme portant le détail des
régularisations, contient en réalité une seule pièce jointe :

> `Provisoire_PENNYLANE_AEJB_Grand_livre2026_01_01..2026_12_31.pdf`

C'est le **grand livre comptable provisoire d'AEJB pour l'exercice 2026**, pas le décompte de Fiducial.
Autrement dit : ce message ne contient pas le détail par poste des régularisations 2022-2024, et rien
n'indique à ce stade que ce détail vous ait jamais été transmis. Ce point converge avec le § 1.

---

## 1. Chronologie — le point déterminant

### 1.1 Règle applicable

Le bail a été signé le **28 juin 2019**, pour prendre effet le **1er septembre 2019** (§ 2 du bail,
`extraits/BAIL.txt`). Il est donc **postérieur au 5 novembre 2014**, date d'entrée en vigueur de la loi
Pinel : les articles **L.145-40-2 du code de commerce** et ses textes d'application **R.145-35 et R.145-36**
lui sont pleinement applicables. Ce n'est pas discutable et c'est le socle de tout ce qui suit.

L'immeuble est **en copropriété** — le bail le confirme à plusieurs reprises (§ 1 « les 98/1000èmes de la
propriété du sol et des parties communes générales », § 8 « tantièmes de copropriété », § 27 « les trois
derniers procès-verbaux de l'assemblée des copropriétaires »). Le délai applicable est donc celui de
**R.145-36 pour les immeubles en copropriété : l'état récapitulatif annuel doit être communiqué au locataire
dans les trois mois suivant la reddition des charges de copropriété** — et non au 30 septembre, qui ne vaut
que pour la monopropriété.

### 1.2 Dates réelles de communication des états récapitulatifs

Établies de façon exhaustive à partir de la boîte Gmail. La recherche `subject:"SOLDE CHARGES"` ne remonte
que **quatre** messages sur toute la période ; une recherche élargie (`from:fiducial.net` sur 2021→2026,
201 messages balayés, plus une recherche ciblée sur *charges / récapitulatif / régularisation / reddition*)
n'en fait apparaître aucun autre.

| Exercice | État récapitulatif communiqué le | Délai écoulé depuis la clôture de l'exercice | Source |
|---|---|---|---|
| 2020 | **22/12/2025** (facture émise le 19/12/2025) | ~5 ans | Msg `19b451be3e48d680` + `extraits/SOLDE_CHARGES_2020.txt` |
| 2021 | **11/02/2026** | ~4 ans 1 mois | Msg `19c4be76da549e2c` |
| 2022 | **17/02/2026** | ~3 ans 1 mois | Msg `19c6a92cdf81dbd1` |
| **2023** | **Jamais communiqué** | — | Absence constatée |
| **2024** | **Jamais communiqué** | — | Absence constatée |
| 2025 | **29/07/2026** | ~7 mois | Msg `19fad52a9fa37400` |

### 1.3 Ce qu'il faut en retenir

**Les dates de reddition des comptes de copropriété par le syndic ne sont pas connues** — elles figurent
dans les documents « SDC » et « RGD » non récupérés. Le calcul du délai de trois mois de R.145-36 ne peut
donc pas être fait poste à poste. Mais l'écart est tel que la conclusion ne dépend pas de cette précision :

- **Exercices 2021 et 2022** : un syndic de copropriété rend ses comptes dans l'année qui suit l'exercice,
  après approbation en assemblée générale. Que la reddition 2021 ait eu lieu en 2022 ou même en 2023, une
  communication au **11 février 2026** excède le délai de trois mois de plusieurs années. L'argument du
  **hors-délai** est ici très solide, sous réserve de la production des dates exactes de reddition.
- **Exercices 2023 et 2024** : aucun état récapitulatif n'a jamais été communiqué. Or c'est précisément sur
  ces exercices que porte une partie des 11 332,83 €. **Réclamer une régularisation sans avoir jamais
  communiqué l'état récapitulatif correspondant** est l'argument le plus fort du dossier. À faire valider :
  l'articulation entre l'inopposabilité tirée du défaut de communication et la prescription quinquennale de
  l'article L.145-60.
- **Exercice 2025** : communiqué le 29/07/2026, soit ~7 mois après la clôture. C'est **le seul exercice pour
  lequel le respect du délai est plausible** — tout dépend de la date de reddition des comptes du syndic. Si
  le syndic a rendu ses comptes après le 29 avril 2026, le délai est respecté.

**Élément de contexte utile** : la régularisation de l'exercice 2020, communiquée le 22/12/2025, s'est
soldée par un **avoir de 38,15 € TTC** en votre faveur (31,79 € HT). Un exercice à quasi-équilibre en 2020,
suivi de 11 332,83 € réclamés sur 2021-2024, justifie à lui seul d'exiger le détail poste par poste.

---

## 2. Ce que dit le bail — inventaire et base de répartition

### 2.1 Quote-part : 183/1000èmes

Le § 1 du bail (DÉSIGNATION) détaille quatre lots :

| Lot | Description | Tantièmes |
|---|---|---|
| 1 | RdC à droite de la porte d'entrée, local commercial (deux bureaux, dégagement) | 98/1000 |
| 2 | RdC à gauche, local sur rue, dégagement, quatre bureaux, deux débarras, deux WC | 73/1000 |
| 19 | Cave au sous-sol, à droite du local technique | 5/1000 |
| 20 | Cave au sous-sol, à gauche du local technique | 7/1000 |
| | **TOTAL** | **183/1000** |

Les lots 1 et 2 « sont actuellement réunis pour former un seul local commercial ».

Le § 8 fixe la base de répartition : les charges « sont calculées sur la base [des tantièmes] de copropriété
ou au prorata des surfaces si l'immeuble n'est pas sous le régime de la copropriété ». L'immeuble étant en
copropriété, **c'est la clé en tantièmes qui s'applique — 183/1000èmes**.

> ⚠️ **À vérifier dès réception des relevés** : que Fiducial applique bien 183/1000 et non une autre clé.
> Les charges de copropriété se répartissent souvent selon des clés spéciales (ascenseur, chauffage,
> escalier) distinctes des tantièmes généraux. Un local commercial en rez-de-chaussée n'a normalement
> **aucune quote-part d'ascenseur ni d'escalier**. C'est un point de contrôle classique et souvent
> productif.

### 2.2 Provisions contractuelles

Le § 8 prévoit une provision de **1 100 € HT par trimestre**, soit **4 400 € HT par an**, « à valoir sur sa
quote-part de charges dans l'attente du décompte qui sera arrêté et apuré une fois par an ».

Sur quatre exercices (2021-2024), cela représente **17 600 € HT de provisions appelées**. Si la
régularisation réclamée est de 11 332,83 € TTC (~9 444 € HT), les charges réelles ressortiraient à ~27 000 €
HT sur quatre ans, soit ~6 760 € HT/an contre 4 400 € provisionnés — un dépassement de plus de 50 % par an.

> ⚠️ **Hypothèse à confirmer** : que la provision soit bien restée à 1 100 € HT/trimestre sur toute la
> période et qu'elle ait effectivement été appelée. Les avis d'échéance non récupérés le diront.

### 2.3 L'inventaire des charges du § 8

Le § 8 énumère les charges remboursables :

- eau et électricité des parties communes, remplacement des ampoules et tubes, minuteries et installations
  électriques, groupes électrogènes ;
- contrôles obligatoires des installations électriques, abonnements aux services de distribution ;
- chauffage collectif et autres prestations collectives ;
- contrats d'entretien ascenseurs et chaudières, abonnement, exploitation, entretien, électricité et
  combustible de ces équipements ;
- main-d'œuvre, salaires et charges du personnel de surveillance, d'entretien, de propreté, de sécurité et
  de gardiennage ; **« les honoraires de syndic »** ;
- primes d'assurances de l'immeuble et des locaux.

Le § 9 (CONTRIBUTION — IMPÔTS — TAXES) met à votre charge la taxe foncière et ses taxes additionnelles, la
contribution sur les revenus locatifs, la TEOM, la taxe de déversement à l'égout et la taxe sur les bureaux,
« le tout en sorte que le loyer touché par le BAILLEUR soit net ».

---

## 3. Postes contestables — grille d'analyse

Cette grille est **prête à être appliquée** aux relevés dès leur réception. Chaque ligne indique la position
du bail et l'argument opposable.

### 3.1 Travaux relevant de l'article 606 du code civil — **non récupérables**

Le bail est ici **explicite et favorable** (§ 13.2.1, dernier alinéa) :

> « Le Bailleur ne conservera à sa charge que les grosses réparations prévues à l'article 606 du Code Civil
> ainsi que les dépenses occasionnées par la vétusté ou par la mise en conformité avec la réglementation
> mais uniquement celles relevant de l'article 606 du code Civil »

et au premier alinéa du même § : toutes réparations sont au Preneur « **sauf celles incombant au Bailleur en
vertu de l'article 606 du Code Civil** et celles relatives au remplacement des gros équipements de
l'immeuble qui demeureront à la charge du Bailleur ».

**À traquer dans les relevés** : gros œuvre, toiture, étanchéité, murs de refend, ravalement, réfection des
canalisations enterrées, remplacement de la chaudière collective ou de l'ascenseur.

> **Signal d'alerte concret** : un fil de mails de mars 2023 porte sur une « **réfection étanchéité
> terrasse** » (`filipe.duarte@fiducial.net`, 15/03/2023 et suivants), et un autre d'avril 2024 sur des
> « Travaux 132 rue de la Roquette ». Des travaux d'étanchéité de terrasse relèvent typiquement de
> l'article 606. **Si ces travaux apparaissent dans les régularisations 2023 ou 2024, c'est un poste à
> contester frontalement** — d'autant qu'aucun état récapitulatif n'a été communiqué pour ces exercices.

### 3.2 La clause de ravalement — **contradiction interne à faire valoir**

Le § 13.2.2 met à votre charge :

> « Les frais de ravalement intérieur ou extérieur de l'immeuble, même si celui-ci résulte de la vétusté de
> l'immeuble ou fait suite à une injonction municipale **mais pour la partie uniquement esthétique
> (nettoyage des façades, gommage, peinture)** »

Deux arguments :

1. **La clause se limite elle-même** à la part esthétique. Tout ravalement mettant en jeu la structure, les
   enduits porteurs ou l'étanchéité de façade sort du périmètre contractuel et retombe sur le bailleur.
2. **R.145-35 exclut de la refacturation les dépenses relatives aux grosses réparations de l'article 606.**
   Pour un bail postérieur au 5 novembre 2014, une clause contraire est **inopposable au preneur** dans
   cette mesure. À faire valider par votre avocat : la portée exacte de cette inopposabilité (clause réputée
   non écrite ou simplement écartée) et l'articulation avec la distinction esthétique/structurel.

### 3.3 « Sans que cette liste soit limitative » — le point de droit le plus intéressant

Le § 13.2.2 introduit la liste des travaux mis à votre charge par :

> « Ces travaux représentent, **sans que cette liste soit limitative** : […] »

Or **L.145-40-2 impose que le bail comporte un inventaire *précis et limitatif* des catégories de charges,
impôts, taxes et redevances liés au bail, avec l'indication de leur répartition entre bailleur et
preneur.** Une clause qui se déclare expressément **non limitative** heurte de front cette exigence.

**Argument à faire valider** : l'inventaire du bail ne satisfait pas à L.145-40-2, ce qui fragilise
l'imputation de tout poste ne figurant pas explicitement au § 8. Corollaire pratique : **tout poste dont le
libellé est trop vague pour être rattaché à une catégorie listée au § 8 est contestable** — à relever
systématiquement dans les relevés.

**À vérifier également** : le PDF du bail qui m'a été remis (16 pages, articles 1 à 30 + signatures)
**ne contient aucune annexe**. Le § 26 annonce pourtant l'annexion du dernier décompte de charges du syndic
« à titre d'information uniquement », le § 25 un DPE, et le § 27 les trois derniers PV d'assemblée générale.
Si ces annexes n'ont jamais été jointes, c'est un moyen supplémentaire au titre de L.145-40-2 et de
l'obligation d'information triennale sur les travaux. **Confirmez-moi si vous détenez un exemplaire avec
annexes.**

### 3.4 Honoraires de gestion et frais de syndic — **nuance importante**

Contrairement au postulat de départ, **le bail vise expressément « les honoraires de syndic » au § 8** comme
charge remboursable. L'argument « les honoraires de syndic ne sont jamais récupérables » ne peut donc pas
être opposé tel quel ici. La distinction à opérer :

| Nature | Position |
|---|---|
| Honoraires du syndic de copropriété au titre de la **gestion courante des parties communes** | Contractuellement prévus au § 8 → difficilement contestables |
| **Honoraires de gestion locative** perçus par FIDUCIAL GÉRANCE pour le compte du bailleur | **Non récupérables** — R.145-35 1° exclut les honoraires liés à la gestion des loyers ; le § 8 ne les vise pas |
| **Honoraires du syndic sur travaux** (pourcentage sur travaux art. 606) | Suivent le sort du principal → **non récupérables** si les travaux relèvent de l'art. 606 |

**À traquer** : toute ligne « honoraires de gestion », « frais de gestion », « honoraires sur travaux »,
« vacation », « frais de relance », « frais de dossier ».

### 3.5 Impôts et taxes — **base contractuelle solide, contestation limitée**

Le § 9 met contractuellement à votre charge la taxe foncière, ses taxes additionnelles, la TEOM, la taxe de
déversement à l'égout et la taxe sur les bureaux. **R.145-35 3° autorise expressément l'imputation au
locataire de la taxe foncière et des taxes additionnelles, ainsi que des impôts et taxes liés à l'usage du
local ou à un service dont le locataire bénéficie.** Ces postes sont donc **a priori dus**, sous réserve du
respect des délais du § 1.

**En revanche, restent contestables** :
- la **CFE/CET du bailleur** (votre propre CFE vous incombe, pas la sienne) ;
- la **contribution sur les revenus locatifs (CRL)** : le § 9 la met à votre charge, mais R.145-35 3° exclut
  les impôts « dont le redevable légal est le bailleur » — la CRL est due par le bailleur. **Point à faire
  trancher par votre avocat**, l'exception textuelle visant la taxe foncière et les taxes liées à l'usage,
  pas la CRL ;
- toute taxe refacturée **sans justificatif d'assiette ni clé de répartition**.

### 3.6 Doublons entre exercices

Contrôle à mener mécaniquement dès réception des relevés 2021, 2022, 2023, 2024 et 2025 : identifier tout
poste au libellé et au montant identiques ou très proches apparaissant sur deux exercices. Le risque est
**élevé ici** pour une raison précise : les exercices 2021 et 2022 ont été régularisés en février 2026, et
les exercices 2023-2024 n'ont jamais fait l'objet d'un état récapitulatif. Une reprise globale a posteriori,
sur une période aussi étalée et rattrapée dans l'urgence, est un terrain favorable aux doubles imputations
et aux reports de solde en cascade.

**Le rapprochement du solde reporté est prioritaire** : la facture du 05/06/2026 fait état d'un solde
antérieur de **38 619 €**, tandis que le solde reporté qui vous est aujourd'hui opposé est de
**10 823,17 €**. L'écart entre ces deux chiffres doit être expliqué ligne à ligne. Vous indiquez verser
18 000 € le 1er de chaque mois sans exception : le rapprochement entre les appels de fonds, vos virements et
les imputations retenues par Fiducial est à faire avant toute discussion sur le fond. Rappelons que le
§ 6 du bail impose un **ordre d'imputation des paiements** (frais de recouvrement, clause pénale, dommages
et intérêts, intérêts de retard, provisions et soldes de charges, dépôt de garantie, puis loyer) — une
imputation non conforme à cet ordre est en soi contestable.

---

## 4. Synthèse

### 4.1 Recevabilité par exercice

| Exercice | Réclamé | État récap. communiqué | Estimé dû | Contestable | Motif principal |
|---|---|---|---|---|---|
| 2021 | *à ventiler* | 11/02/2026 (~4 ans) | *n.d.* | **Totalité, sous réserve** | **Hors délai** R.145-36 (3 mois après reddition) |
| 2022 | *à ventiler* | 17/02/2026 (~3 ans) | *n.d.* | **Totalité, sous réserve** | **Hors délai** R.145-36 |
| 2023 | *à ventiler* | **Jamais** | *n.d.* | **Totalité** | **Aucun état récapitulatif communiqué** |
| 2024 | *à ventiler* | **Jamais** | *n.d.* | **Totalité** | **Aucun état récapitulatif communiqué** |
| **Total 2021-2024** | **11 332,83 € TTC** | — | *n.d.* | — | — |
| 2025 | *hors périmètre* | 29/07/2026 (~7 mois) | *n.d.* | Analyse au fond | Délai **plausiblement respecté** — à confirmer par la date de reddition |
| Solde reporté | **10 823,17 €** | — | *n.d.* | **À rapprocher** | Écart inexpliqué avec les 38 619 € du 05/06/2026 |

*n.d. = non déterminable sans les relevés détaillés.*

### 4.2 Motifs de refus, par ordre de force

1. **Absence totale d'état récapitulatif pour 2023 et 2024** — le plus solide. Une régularisation est
   réclamée sur des exercices dont le décompte n'a jamais été communiqué.
2. **Hors délai manifeste pour 2021 et 2022** — communication 3 à 4 ans après l'exercice, très au-delà des
   trois mois suivant la reddition des comptes de copropriété (R.145-36). *Reste à produire les dates
   exactes de reddition.*
3. **Article 606 du code civil** — le bail réserve expressément ces travaux au bailleur (§ 13.2.1). Vigilance
   particulière sur l'étanchéité de terrasse (travaux documentés en 2023).
4. **Inventaire non limitatif (§ 13.2.2) contraire à L.145-40-2** — fragilise tout poste hors § 8.
5. **Clause de ravalement** — limitée à l'esthétique par le bail lui-même, et écartée par R.145-35 pour la
   part relevant de l'article 606.
6. **Erreurs de clé de répartition** — vérifier l'application des 183/1000èmes et l'absence de quote-part
   d'ascenseur/escalier pour un local en rez-de-chaussée.
7. **Honoraires de gestion locative et honoraires de syndic sur travaux art. 606**.
8. **CRL et CFE du bailleur** — à faire trancher.

### 4.3 Ce qui ne peut pas encore être produit

La **décomposition des 11 332,83 € par exercice et par poste**, la **reconstitution de la quote-part** et le
**rapprochement relevé du syndicat / relevé individuel** exigent les relevés détaillés. Aucun de ces trois
travaux ne peut être fait sans les PDF listés au § 0. **Aucun chiffre n'a été estimé ni interpolé** dans ce
document.

---

## 5. Points à faire valider par votre avocat

1. Le délai de R.145-36 en copropriété (3 mois après reddition) et sa sanction : inopposabilité de la
   régularisation, ou simple inexigibilité jusqu'à communication ?
2. L'articulation avec la **prescription quinquennale de L.145-60** : au 15/08/2026, quelle fraction des
   exercices 2021 et suivants est atteinte ?
3. La portée d'une clause d'inventaire **expressément non limitative** au regard de L.145-40-2, pour un bail
   du 28/06/2019.
4. Le sort de la **CRL** mise à la charge du preneur par le § 9 face à l'exclusion de R.145-35 3°.
5. L'effet de l'absence éventuelle des annexes visées aux § 25, 26 et 27 du bail.
6. L'opportunité d'une **contestation écrite conservatoire** avant tout paiement, pour interrompre toute
   reconnaissance de dette implicite — étant observé que Sandrine Da Costa a écrit le 30/06/2026 « je suis
   ok avec le solde antérieur », ce qui, selon le contexte, pourrait vous être opposé.

---

## 6. Pour compléter l'analyse — deux voies

Les PDF Fiducial ne peuvent pas être récupérés depuis cette session. Au choix :

**Voie 1 — dépôt direct (le plus simple).** Téléchargez les pièces jointes depuis Gmail et déposez-les dans
la conversation, comme vous l'avez fait pour le bail. Documents utiles, par ordre de priorité :

1. Les 5 PDF du **solde 2025** (msg du 29/07/2026) : `FACTURE SOLDE CHARGES 2025`, `Relevé individuel`,
   `RGD CHARGES ET TRAVAUX 2025`, `SDC 2025`, `V Relevé dépenses`
2. Les **soldes charges 2021** (mail du 11/02/2026) et **2022** (mail du 17/02/2026) — *ce sont eux qui
   portent une part des 11 332,83 €*
3. La **facture du 05/06/2026** avec le solde antérieur de 38 619 €
4. Le **détail des régularisations 2021-2024** s'il vous a été transmis par un autre canal (la PJ de
   Sandrine du 30/06/2026 n'est pas ce document — voir § 0.2)
5. Un exemplaire du **bail avec ses annexes**, si vous en disposez

**Voie 2 — Google Drive.** Déposez les fichiers dans un dossier Drive : j'y ai accès en lecture et je les
récupère directement. C'est ainsi que le solde 2020 a été obtenu.

Le script `extraction.py` est prêt : il traite indifféremment les PDF texte (pdfplumber, avec export CSV des
tableaux) et les PDF scannés (rendu 300 dpi + OCR français), et écrit les `.txt` et `.csv` dans `extraits/`.
Dès réception, l'analyse est complétée sans délai supplémentaire.

---

## Annexe — fichiers du dossier

```
charges-fiducial/
├── analyse-charges-fiducial.md      ce document
├── extraction.py                    extraction PDF texte + OCR français
├── pdf/                             sources (non versionné)
│   ├── BAIL.pdf                     bail commercial du 28/06/2019, 16 p.
│   └── SOLDE_CHARGES_2020.pdf       avoir du 19/12/2025, -38,15 € TTC
├── img/                             pages rendues + OCR (non versionné)
└── extraits/
    ├── BAIL.txt                     OCR intégral du bail
    └── SOLDE_CHARGES_2020.txt       texte du solde 2020
```

**Note sur l'OCR** : le bail est un scan. Le texte OCRisé comporte des imperfections de reconnaissance
(caractères parasites, colonnes mêlées). Toutes les clauses citées dans ce document ont été relues page à
page ; les tantièmes et les montants ont été vérifiés sur le rendu image. Aucune valeur illisible n'a été
devinée.
