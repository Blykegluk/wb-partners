// Doublure fidèle du contexte : identités stables (objets au niveau module),
// données calquées sur la société CREB au 30/07/2026.
const societe = { id: 'soc-1', nom: 'CREB', iban: 'FR76 0000', siret: '123' }
const biens = [{ id: 'bien-1', societe_id: 'soc-1', reference: 'Rue du Havre', adresse: '12 rue du Havre', ville: 'Paris' }]
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
const mvt = (id, txid, date, montant, st) => ({
  id, societe_id: 'soc-1', transaction_id: txid, booking_date: date, amount: montant,
  credit_debit: 'CRDT', statut_rapprochement: st, motif_ecart: null,
})
const bankTransactions = [
  mvt('m1','t1','2026-02-10',10400,'rapproche_auto'),
  mvt('m2','t2','2026-03-10',10425,'rapproche_auto'),
  mvt('m3','t3','2026-04-08',10425,'rapproche_auto'),
  mvt('m4','t4','2026-05-06',8545,'rapproche_auto'),
  { id: 'm5', societe_id: 'soc-1', transaction_id: null, booking_date: '2026-05-27', amount: 33616,
    credit_debit: 'CRDT', statut_rapprochement: 'qualifie', categorie: 'indemnite_resiliation',
    remittance_information: 'VIR SCM BORDIER — indemnité résiliation' },
]
const courriers = [{
  id: 'c1', societe_id: 'soc-1', bail_id: 'bail-1', transaction_id: 't0', type: 'mise_en_demeure',
  mois: 0, annee: 2026, canal: 'email', statut: 'envoye', destinataire: 'locataire@exemple.fr',
  envoye_le: '2026-04-12T08:00:00Z', envoye_par: null,
}]
const envoisConfig = { societe_id: 'soc-1', quittance_auto: true, avis_jour: 1,
  relance_apres_jours: 5, mise_en_demeure_apres_jours: 15, commandement_apres_jours: 30 }
const bankAccounts = [{ id: 'acc-1', societe_id: 'soc-1', name: 'Caisse d’Épargne', derniere_sync: '2026-07-29' }]
const value = {
  societes: [societe], loadingSocietes: false, selected: societe, role: 'owner',
  canEdit: true, isAdmin: true,
  biens, locataires, baux, transactions, documents: [], membres: [], revisions: [],
  evenements: [], appelsCharges: [], actionnaires: [], bienActionnaires: [], personnes: [],
  bankConnection: { status: 'connected', last_sync: '2026-07-29' }, bankAccounts, bankTransactions,
  courriers, envoisConfig,
  loadingData: false, reload: () => {},
}
export const useSociete = () => value
export const SocieteProvider = ({ children }) => children
