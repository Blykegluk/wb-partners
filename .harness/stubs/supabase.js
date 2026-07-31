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
  ],
  commentaires: [
    { opportunite_id: 'o1', contenu: "Très bon dossier — j'ai appelé l'agence, visite possible mardi. Le brut se négocie, viser 1 150 €/m².", cree_le: '2026-07-31T10:12:00Z', auteur: 'u1', profiles: { full_name: 'Anthony B.' } },
    { opportunite_id: 'o1', contenu: 'Prix modifié : 355 k → 338 k', cree_le: '2026-07-30T06:10:00Z', auteur: null, profiles: null },
    { opportunite_id: 'o3', contenu: "Vu sur place samedi : emplacement top mais la réserve est en sous-sol, à vérifier pour un repreneur alimentaire.", cree_le: '2026-07-29T18:40:00Z', auteur: 'u2', profiles: { full_name: 'William' } },
    { opportunite_id: 'o3', contenu: "Le locataire serait ouvert à un déplafonnement contre travaux de façade — à creuser.", cree_le: '2026-07-30T09:02:00Z', auteur: 'u1', profiles: { full_name: 'Anthony B.' } },
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
