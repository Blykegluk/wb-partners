// Doublure du client Supabase : enregistre les appels, ne sort jamais sur le
// réseau. Sert des données de table quand le harnais en fournit (TABLES).
const opp = (id, r, extra) => ({
  id, recherche: r, statut: 'active', hors_critere: false, type_offre: 'vente',
  detecte_le: '2026-07-30T06:10:00Z', decouvert_le: '2026-07-30T06:10:00Z',
  verifie_le: '2026-07-31', source: 'BureauxLocaux', lien: 'https://example.com',
  latitude: 48.89 + Math.sin(id.length) * 0.05, longitude: 2.33 + id.length * 0.01,
  ...extra,
})
const TABLES = {
  opportunites: [
    opp('o4', 'R3', { adresse: '13 Chemin Latéral (Carré des Vives)', ville: 'Bondy', code_postal: '93140',
      type_offre: 'location', loyer_annuel: 66000, prix_m2: null, surface_totale: 420, score: 67,
      ca_potentiel: { central: 1200000, ca_naturalia: 760000, ca_g20: 1200000, recommandation: 'conventionnel' },
      points_forts: 'Zone commerciale établie, parking, quai de livraison',
      points_vigilance: 'Concurrence Leclerc à 800 m' }),
    opp('o5', 'R3', { adresse: 'Zone des Flanades', ville: 'Sarcelles', code_postal: '95200',
      type_offre: 'vente', prix: 890000, surface_totale: 380, score: 57,
      ca_potentiel: { central: 1100000, ca_naturalia: 1100000, ca_g20: 1737000, recommandation: 'bio' },
      points_forts: 'Densité résidentielle forte',
      points_vigilance: "Pouvoir d'achat de la zone à valider pour du bio" }),
    opp('o1', 'R4', { adresse: 'ZAC du Landy, local neuf angle', ville: 'Noisy-le-Sec', code_postal: '93130',
      prix: 338000, prix_m2: 1300, surface_totale: 260, rendement_brut: 10.8, score: 64,
      points_forts: "Angle très visible, brut de béton, proche RER E, prix 35 % sous le neuf du secteur",
      points_vigilance: "Local vide : rendement estimé sur valeur locative, pas de bail en place ; aménagement au preneur à négocier" }),
    opp('o2', 'R4', { adresse: 'ZAC Ivry-Confluences, 282 m² brut', ville: 'Ivry-sur-Seine', code_postal: '94200',
      prix: 553798, prix_m2: 1960, surface_totale: 282, rendement_brut: 9.2, score: 58, hors_critere: true,
      motif_hors_critere: "9,2 % soutenable (< 10 %) mais forte négociation affichée : à ~500 k€ le seuil est atteint",
      points_forts: "Vitrines posées, HSP 3,73 m, quartier en livraison massive",
      points_vigilance: "Flag loyer promoteur sur l'annonce jumelle (+12 % revendiqués à 190 €/m²)" }),
    opp('o3', 'R1', { adresse: '12 rue de Paris, murs occupés', ville: 'Montreuil', code_postal: '93100',
      prix: 480000, prix_m2: 4000, surface_totale: 120, rendement_brut: 8.4, score: 72, statut: 'a_visiter',
      locataire: 'Boulangerie Maison M (indépendant)', garanties: 'DG 3 mois + GAPD',
      points_forts: "Loyer 8 % sous le marché, bail 3/6/9 renouvelé 2025",
      points_vigilance: "Façade à rafraîchir, DPE E" }),
    // R5 : annonces BODACC (procédures collectives, commerces alimentaires).
    // Ni prix ni surface, scores provisoires à 50, tout est dans bodacc_detail.
    opp('o6', 'R5', { adresse: '4 rue des Poissonniers', ville: 'Paris', code_postal: '75018',
      type_offre: "BODACC — Dépôt de l'état des créances", score: 50, source: 'bodacc',
      candidat_lab: 'a_etudier', detecte_le: '2026-07-31T05:45:00Z',
      date_publication_annonce: '2026-07-31',
      occupation: "Exploitation d'un fonds de commerce d'alimentation générale, épicerie.",
      points_vigilance: "L'état des créances est déposé au greffe où tout intéressé peut présenter réclamation devant le juge-commissaire dans le délai d'un mois à compter de la présente publication.",
      bodacc_detail: { siren: '797 879 830', nature: "Dépôt de l'état des créances", famille: 'Procédures collectives',
        parution: '20260159', numero_annonce: 2162, tribunal: 'Greffe du Tribunal des Activités Economiques de Paris',
        denomination: 'BEN SASSI', date_jugement: '2026-04-15',
        complement: "L'état des créances est déposé au greffe où tout intéressé peut présenter réclamation devant le juge-commissaire dans le délai d'un mois à compter de la présente publication." } }),
    opp('o7', 'R5', { adresse: '8 rue Lequesne', ville: 'Nogent-sur-Marne', code_postal: '94130',
      type_offre: 'BODACC — Jugement de conversion en liquidation judiciaire', source: 'bodacc',
      candidat_lab: 'oui', detecte_le: '2026-07-30T05:45:00Z',
      // Noté avec la grille de R3, renormalisée : le loyer et la surface de
      // vente sont inconnus, leurs critères valent null et sortent du total.
      score: 71,
      score_detail: { 'potentiel de CA de la zone (30)': 24, 'intensité concurrentielle (20)': 13,
        'économie loyer/CA (20)': null, 'configuration (15)': null, 'accessibilité & flux (10)': 7,
        'disponibilité/timing (5)': 2 },
      justification_score: "71 sur 60 points évaluables (loyer et surface de vente inconnus) — chalandise dense, concurrence conventionnelle modérée à 500 m. Non comparable à un score R3 complet.",
      ca_potentiel: { basse: 980000, central: 1350000, haute: 1700000, ca_naturalia: 890000, ca_g20: 1350000,
        recommandation: 'conventionnel', hypotheses: 'Surface de vente estimée à vérifier auprès du mandataire' },
      analyse_concurrence: { concurrents: [
        { enseigne: 'Franprix', type: 'conventionnel', distance: '240 m' },
        { enseigne: 'Naturalia', type: 'bio', distance: '850 m' } ], synthese: 'Pression conventionnelle proche' },
      date_publication_annonce: '2026-07-28',
      occupation: 'supermarché, commerce de détail de viandes et de produits a base de viande en magasin spécialisé, alimentation générale, fruits et légumes.',
      points_vigilance: "Jugement prononçant la liquidation judiciaire désignant liquidateur Bvmj prise en la personne de Me Thomas Villemur 69 Rue d'Anjou 93000 BOBIGNY.",
      bodacc_detail: { siren: '852 948 504', nature: 'Jugement de conversion en liquidation judiciaire', famille: 'Procédures collectives',
        parution: '20260156', numero_annonce: 3820, tribunal: 'Greffe du Tribunal de Commerce de Bobigny',
        denomination: 'MARMARA', date_jugement: '2026-07-20',
        complement: "Jugement prononçant la liquidation judiciaire désignant liquidateur Bvmj prise en la personne de Me Thomas Villemur 69 Rue d'Anjou 93000 BOBIGNY." } }),
  ],
  commentaires: [
    { opportunite_id: 'o1', contenu: "Très bon dossier — j'ai appelé l'agence, visite possible mardi. Le brut se négocie, viser 1 150 €/m².", cree_le: '2026-07-31T10:12:00Z', auteur: 'u1', profiles: { full_name: 'Anthony B.' } },
    { opportunite_id: 'o1', contenu: 'Prix modifié : 355 k → 338 k', cree_le: '2026-07-30T06:10:00Z', auteur: null, profiles: null },
    { opportunite_id: 'o3', contenu: "Vu sur place samedi : emplacement top mais la réserve est en sous-sol, à vérifier pour un repreneur alimentaire.", cree_le: '2026-07-29T18:40:00Z', auteur: 'u2', profiles: { full_name: 'William' } },
    { opportunite_id: 'o3', contenu: "Le locataire serait ouvert à un déplafonnement contre travaux de façade — à creuser.", cree_le: '2026-07-30T09:02:00Z', auteur: 'u1', profiles: { full_name: 'Anthony B.' } },
  ],
  cibles: [
    { id: 'c1', type: 'supermarche_dirigeant', siren: '392768362', denomination: 'TRYO', naf: '47.11D',
      region: '93', ville: 'SAINT-LAURENT-DU-VAR', code_postal: '06700', adresse: 'BOULEVARD MARCEL PAGNOL 06700 SAINT-LAURENT-DU-VAR',
      nb_etablissements: 1, effectif: '22', date_creation: '1993-10-22', statut: 'a_qualifier',
      dirigeant_nom: 'JEAN-PIERRE ABRIL', dirigeant_naissance: '1951-06', dirigeant_qualite: 'Président de SAS',
      via_holding: null, releve_possible: false,
      co_dirigeants: [{ n: 'JEAN-PIERRE ABRIL', d: '1951-06', q: 'Président de SAS' }, { n: 'NADINE ABRIL (TERME)', d: '1961-10', q: 'Directeur Général' }],
      ca: 42221449, resultat: 1925219, annee_finances: '2024', score: 92, latitude: 43.667, longitude: 7.181, geo_approx: false,
      score_detail: { 'âge du dirigeant effectif (30)': 30, 'absence de relève identifiée (25)': 25,
        'ancienneté de la société (15)': 15, 'taille — CA connu (15)': 10, 'effectif salarié (10)': 10, 'multi-établissements (5)': 3 },
      lien: 'https://annuaire-entreprises.data.gouv.fr/entreprise/392768362', detecte_le: '2026-08-21T21:00:00Z' },
    { id: 'c2', type: 'supermarche_dirigeant', siren: '328594791', denomination: 'AUX QUATRE SAISONS', naf: '47.11D',
      region: '11', ville: 'PARIS', code_postal: '75015', adresse: '47 RUE DU COMMERCE 75015 PARIS',
      nb_etablissements: 4, effectif: '21', date_creation: '1983-11-15', statut: 'a_contacter',
      dirigeant_nom: 'PASCAL LAINE', dirigeant_naissance: '1959-08', dirigeant_qualite: 'Gérant',
      via_holding: null, releve_possible: false,
      co_dirigeants: [{ n: 'PASCAL LAINE', d: '1959-08', q: 'Gérant' }],
      ca: 15116031, resultat: 600743, annee_finances: '2018', score: 90, latitude: 48.8466, longitude: 2.2956, geo_approx: false,
      score_detail: { 'âge du dirigeant effectif (30)': 27, 'absence de relève identifiée (25)': 25,
        'ancienneté de la société (15)': 15, 'taille — CA connu (15)': 15, 'effectif salarié (10)': 10, 'multi-établissements (5)': 5 },
      lien: 'https://annuaire-entreprises.data.gouv.fr/entreprise/328594791', detecte_le: '2026-08-21T21:00:00Z' },
    { id: 'c3', type: 'supermarche_dirigeant', siren: '572165256', denomination: 'SUPERMARCHE DELATTRE', naf: '47.11C',
      region: '11', ville: 'PARIS', code_postal: '75002', adresse: '15 RUE DES PETITS CARREAUX 75002 PARIS',
      nb_etablissements: 2, effectif: '12', date_creation: '1957-01-01', statut: 'a_qualifier',
      dirigeant_nom: 'PHILIPPE DELATTRE', dirigeant_naissance: '1958-01', dirigeant_qualite: 'Gérant',
      via_holding: 'ELADIS HOLDING', releve_possible: true,
      co_dirigeants: [{ n: 'ADRIEN DELATTRE', d: '1989-11', q: 'Gérant' }, { n: 'PHILIPPE DELATTRE', d: '1958-01', q: 'Gérant' }],
      ca: 11200990, resultat: 377281, annee_finances: '2024', score: 66, latitude: 48.8669, longitude: 2.3471, geo_approx: true,
      score_detail: { 'âge du dirigeant effectif (30)': 22, 'absence de relève identifiée (25)': 5,
        'ancienneté de la société (15)': 15, 'taille — CA connu (15)': 15, 'effectif salarié (10)': 10, 'multi-établissements (5)': 5 },
      lien: 'https://annuaire-entreprises.data.gouv.fr/entreprise/572165256', detecte_le: '2026-08-21T21:00:00Z' },
  ],
  cibles_commentaires: [
    { cible_id: 'c2', contenu: "Appelé le magasin : le gérant est ouvert à discuter après la rentrée.", cree_le: '2026-08-21T18:00:00Z', auteur: 'u1', profiles: { full_name: 'Anthony B.' } },
  ],
  runs: [{ id: 'r1', date_run: '2026-07-31', annonces_analysees: 59, nouvelles: 3, expirees: 0, rapport: '# Rapport', requetes: {} }],
}
const result = (data = null) => Promise.resolve({ data, error: null })
const chain = (table) => {
  const rows = TABLES[table] || []
  const c = {}
  const self = () => c
  for (const m of ['select','eq','neq','order','limit','update','insert','upsert','delete','not','like','in','range','gt']) c[m] = self
  c.maybeSingle = () => result(null)
  c.single = () => result(null)
  c.then = (res) => result(rows).then(res)
  return c
}
export const supabase = {
  from: (table) => chain(table),
  auth: { getSession: () => result({ session: { access_token: 'test' } }) },
}
