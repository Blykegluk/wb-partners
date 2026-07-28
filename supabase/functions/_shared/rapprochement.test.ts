import { rapprocher, scorer, normaliser } from './rapprochement.ts'

const ech = (id: string, bail: string, mois: number, annee: number, loyer: number, charges: number) =>
  ({ id, bail_id: bail, mois, annee, montant_loyer: loyer, montant_charges: charges })
const mvt = (id: string, date: string, montant: number, libelle: string, op = 'transfer') =>
  ({ id, date, montant, libelle, libelle_brut: libelle, operation_type: op })

const ctx = new Map([
  ['bail-A', { bail_id: 'bail-A', noms: ['SCM BORDIER ET CHICHE'] }],
  ['bail-B', { bail_id: 'bail-B', noms: ['Pharmacie des Epars'] }],
])

let ok = 0, ko = 0
const t = (nom: string, cond: boolean) => {
  if (cond) { ok++; console.log('  OK  ', nom) } else { ko++; console.log('  ECHEC', nom) }
}

console.log("\n1. Loyer paye A L'HEURE")
let r = rapprocher([ech('e1','bail-A',6,2026,8500,0)],
                   [mvt('m1','2026-07-03',8500,'VIR SEPA SCM BORDIER ET CHICHE')], ctx)
t('rapproche automatiquement', r.affectations.length === 1)

console.log('\n2. Loyer paye EN RETARD (le bug de la v1)')
r = rapprocher([ech('e2','bail-A',5,2026,8500,0)],
               [mvt('m2','2026-07-20',8500,'VIR SEPA SCM BORDIER ET CHICHE')], ctx)
t('rapproche malgre 49 jours de retard', r.affectations.length === 1)

console.log('\n3. AMBIGUITE : deux baux au meme loyer, libelle neutre')
r = rapprocher([ech('e3','bail-A',6,2026,1000,0), ech('e4','bail-B',6,2026,1000,0)],
               [mvt('m3','2026-07-05',1000,'VIR SEPA RECU')], ctx)
t('aucun rapprochement auto (doute)', r.affectations.length === 0)
t('des suggestions sont proposees', (r.suggestions.get('m3') || []).length > 0)

console.log("\n4. Le libelle leve l'ambiguite")
r = rapprocher([ech('e5','bail-A',6,2026,1000,0), ech('e6','bail-B',6,2026,1000,0)],
               [mvt('m4','2026-07-05',1000,'VIR SEPA PHARMACIE DES EPARS')], ctx)
t('rapproche sur le bon bail', r.affectations[0]?.echeance_id === 'e6')

console.log("\n5. Un virement ne solde qu'une echeance")
r = rapprocher([ech('e7','bail-A',6,2026,8500,0), ech('e8','bail-A',7,2026,8500,0)],
               [mvt('m5','2026-07-03',8500,'VIR SEPA SCM BORDIER ET CHICHE')], ctx)
t('une seule affectation', r.affectations.length <= 1)

console.log('\n6. Montant trop eloigne -> ecarte')
r = rapprocher([ech('e9','bail-A',6,2026,8500,0)],
               [mvt('m6','2026-07-03',5000,'VIR SEPA SCM BORDIER ET CHICHE')], ctx)
t('non rapproche', r.affectations.length === 0)

console.log('\n7. Prelevement carte du bon montant -> penalise')
const s = scorer(ech('e10','bail-A',6,2026,1000,0),
                 mvt('m7','2026-07-03',1000,'ACHAT CB','card'), ctx.get('bail-A'))
t('score sous le seuil auto', s.score < 0.75)

console.log('\n8. Normalisation des accents')
t('accents et casse neutralises', normaliser('Ref. Pharmacie des Epars') === 'REF PHARMACIE DES EPARS')

console.log(`\n${ok} reussis, ${ko} echoues`)
process.exit(ko === 0 ? 0 : 1)
