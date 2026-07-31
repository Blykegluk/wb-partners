// Doublure fidèle du contexte : identités stables (objets au niveau module),
// données calquées sur la société CREB au 31/07/2026, banque connectée avec
// solde réel et mouvements catégorisés.
const societe = { id: 'soc-1', nom: 'CREB', iban: 'FR76 0000', siret: '123' }
const biens = [{
  id: 'bien-1', societe_id: 'soc-1', reference: 'Rue du Havre', adresse: '12 rue du Havre',
  ville: 'Paris', statut: 'acquis', annuites: 4200, taxe_fonciere: 6800, charges: 350,
  charges_refacturables: 2400, charges_non_refacturables: 1800,
}]
const locataires = [{ id: 'loc-1', societe_id: 'soc-1', raison_sociale: 'SCM BORDIER ET CHICHE', email: 'locataire@exemple.fr' }]
const baux = [{
  id: 'bail-1', societe_id: 'soc-1', bien_id: 'bien-1', locataire_id: 'loc-1',
  loyer_ht: 7900, charges: 600, actif: true, tva_applicable: true, taux_tva: 20,
  date_debut: '2021-05-25', date_fin: '2026-06-30', auto_avis: false, auto_relance: true,
}]
const tx = (id, mois, statut) => ({
  id, societe_id: 'soc-1', bail_id: 'bail-1', mois, annee: 2026,
  montant_loyer: 7900, montant_charges: 600, statut, relance_count: 0,
})
const transactions = [tx('t0',0,'payé'), tx('t1',1,'payé'), tx('t2',2,'payé'), tx('t3',3,'payé'), tx('t4',4,'payé'), tx('t5',5,'payé')]

const UID = 'acc-uid-1'
const mvt = (id, txid, date, montant, st, categorie = null) => ({
  id, societe_id: 'soc-1', account_uid: UID, transaction_id: txid, booking_date: date,
  amount: montant, credit_debit: montant > 0 ? 'CRDT' : 'DBIT',
  statut_rapprochement: st, motif_ecart: null, categorie,
  remittance_information: categorie ? categorie.replaceAll('_', ' ').toUpperCase() : 'VIR SCM BORDIER ET CHICHE',
})
const bankTransactions = [
  // Loyers rapprochés
  mvt('m1','t1','2026-02-10',10400,'rapproche_manuel'),
  mvt('m2','t2','2026-03-10',10425,'rapproche_manuel'),
  mvt('m3','t3','2026-04-08',10425,'rapproche_manuel'),
  mvt('m4','t4','2026-05-06',8545,'rapproche_manuel'),
  // Indemnité de résiliation (crédit qualifié)
  mvt('m5',null,'2026-05-27',33616,'qualifie','indemnite_resiliation'),
  // Débits qualifiés
  mvt('d1',null,'2026-02-15',-1420,'qualifie','echeance_pret'),
  mvt('d2',null,'2026-03-15',-1420,'qualifie','echeance_pret'),
  mvt('d3',null,'2026-04-15',-1420,'qualifie','echeance_pret'),
  mvt('d4',null,'2026-05-15',-1420,'qualifie','echeance_pret'),
  mvt('d5',null,'2026-06-15',-1420,'qualifie','echeance_pret'),
  mvt('d6',null,'2026-07-15',-1420,'qualifie','echeance_pret'),
  mvt('d7',null,'2026-03-20',-1306,'qualifie','impots_taxes'),
  mvt('d8',null,'2026-04-22',-4980,'qualifie','travaux'),
  mvt('d9',null,'2026-05-12',-870,'qualifie','honoraires'),
  mvt('d10',null,'2026-06-03',-612,'qualifie','charges_copropriete'),
  mvt('d11',null,'2026-07-08',-215,'a_qualifier'),
]
const bankAccounts = [{
  id: 'acc-1', societe_id: 'soc-1', account_uid: UID, name: 'Caisse d’Épargne',
  currency: 'XXX', solde: 166185.63, suivi: true, derniere_sync: '2026-07-31',
}]
const courriers = [{
  id: 'c1', societe_id: 'soc-1', bail_id: 'bail-1', transaction_id: 't0', type: 'mise_en_demeure',
  mois: 0, annee: 2026, canal: 'email', statut: 'envoye', destinataire: 'locataire@exemple.fr',
  envoye_le: '2026-04-12T08:00:00Z', envoye_par: null,
}]
const envoisConfig = { societe_id: 'soc-1', quittance_auto: true, avis_jour: 1,
  relance_apres_jours: 5, mise_en_demeure_apres_jours: 15, commandement_apres_jours: 30 }
const value = {
  societes: [societe], loadingSocietes: false, selected: societe, role: 'owner',
  canEdit: true, isAdmin: true,
  biens, locataires, baux, transactions, documents: [], membres: [], revisions: [],
  evenements: [], appelsCharges: [], actionnaires: [], bienActionnaires: [], personnes: [],
  bankConnection: { status: 'connected', last_sync: '2026-07-31' }, bankAccounts, bankTransactions,
  courriers, envoisConfig,
  loadingData: false, reload: () => {},
}
export const useSociete = () => value
export const SocieteProvider = ({ children }) => children
