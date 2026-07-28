import { MONTHS, MONTHS_SHORT, getLoyerPourMois, fmt, fmtPct } from './utils'
import { rendementBrut, rendementNet, cashflowMensuel, agregatsBiens, partSociete, quotePartPersonne, estAcquis } from './calculs'

// Print a generated document by injecting it directly into the current page,
// then printing the page itself.
//
// Every other approach was unreliable here:
//   - window.open() is blocked whenever the caller awaited something first
//     (the user-gesture context is gone), which is the case for the fiche
//     patrimoniale — it fetches from Supabase before printing.
//   - An off-screen iframe printed the PARENT document instead of its own
//     content: blank page, with the app's title and URL in the print header.
//
// Injecting into the live document removes both failure modes: no popup, no
// second browsing context, no timing dependency. A print stylesheet (see
// index.css) hides the application and reveals only #wb-print-host while the
// print dialog is open.
const PRINT_HOST_ID = 'wb-print-host'

const openPrint = (html) => {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const styles = Array.from(parsed.querySelectorAll('style'))
    .map(s => s.textContent)
    .join('\n')
  const bodyHtml = parsed.body ? parsed.body.innerHTML : ''
  const docTitle = parsed.querySelector('title')?.textContent?.trim()

  if (!bodyHtml) {
    alert("Le document n'a pas pu être généré (contenu vide).")
    return
  }

  let host = document.getElementById(PRINT_HOST_ID)
  if (!host) {
    host = document.createElement('div')
    host.id = PRINT_HOST_ID
    document.body.appendChild(host)
  }
  host.innerHTML = `<style>${styles}</style>${bodyHtml}`

  // Le navigateur reprend document.title dans l'en-tête d'impression et comme
  // nom de fichier proposé : on l'aligne sur le document, puis on restaure.
  const previousTitle = document.title
  if (docTitle) document.title = docTitle

  document.documentElement.classList.add('wb-printing')

  const cleanup = () => {
    document.documentElement.classList.remove('wb-printing')
    document.title = previousTitle
    host.innerHTML = ''
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  // Filet de sécurité : certains navigateurs n'émettent pas afterprint.
  setTimeout(cleanup, 60000)

  // Laisse un tick au navigateur pour appliquer les styles avant d'imprimer.
  setTimeout(() => window.print(), 100)
}

const baseStyle = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a2d4e;padding:48px;font-size:13px;line-height:1.6}.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a2d4e;padding-bottom:20px;margin-bottom:36px}.logo{font-size:22px;font-weight:900;letter-spacing:4px}.logo small{display:block;font-size:10px;color:#94a3b8;font-weight:400;margin-top:2px}.doc-title h1{font-size:18px;font-weight:700;text-align:right}.doc-title p{font-size:12px;color:#64748b;text-align:right}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:28px}.bloc h3{font-size:10px;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;letter-spacing:1px}.bien-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#1a2d4e;color:#fff;padding:10px 14px;text-align:left;font-size:11px}td{padding:10px 14px;border-bottom:1px solid #f1f5f9}.tot td{background:#eff6ff;font-weight:700;border-top:2px solid #1a2d4e}.iban{background:#1a2d4e;color:#fff;border-radius:8px;padding:14px 20px;display:flex;justify-content:space-between;margin-bottom:20px}.iban .lbl{font-size:10px;opacity:.6;margin-bottom:3px}.iban .val{font-size:14px;font-weight:600}.note{font-size:11px;color:#94a3b8;font-style:italic}.footer{text-align:center;color:#94a3b8;font-size:11px;margin-top:48px;padding-top:16px;border-top:1px solid #f1f5f9}@media print{@page{margin:1.5cm}}`

const header = (soc, title, sub) => `
  <div class="hdr">
    <div style="display:flex;align-items:center;gap:12px">
      <img src="https://wbpartners.fr/logo.png" alt="" width="40" height="40" style="border-radius:8px" />
      <div class="logo">${soc?.nom_affiche || soc?.nom || 'WB Partners'}<small>Gestion Immobilière</small></div>
    </div>
    <div class="doc-title"><h1>${title}</h1>${sub}</div>
  </div>`

// Generate unique payment reference: BIEN-MOIS-ANNEE-CODE
const genRef = (bail, mois, annee) => {
  const bienCode = (bail?.id || '').slice(0, 6).toUpperCase()
  return `LOY-${bienCode}-${String(mois + 1).padStart(2, '0')}${annee}`
}

const parties = (soc, loc) => `
  <div class="grid2">
    <div class="bloc">
      <h3>Bailleur</h3>
      <p><strong>${soc?.nom || '—'}</strong>
      ${soc?.capital ? `<br>Capital : ${soc.capital}` : ''}
      ${soc?.siret ? `<br>SIRET : ${soc.siret}` : ''}
      ${soc?.rcs ? `<br>RCS : ${soc.rcs}` : ''}
      ${soc?.ape ? `<br>APE : ${soc.ape}` : ''}
      ${soc?.tva_intracommunautaire ? `<br>TVA : ${soc.tva_intracommunautaire}` : ''}
      ${soc?.adresse ? `<br>${soc.adresse}` : ''}
      ${soc?.code_postal || soc?.ville ? `<br>${soc.code_postal || ''} ${soc.ville || ''}` : ''}
      ${soc?.telephone ? `<br>Tél : ${soc.telephone}` : ''}
      ${soc?.email ? `<br>${soc.email}` : ''}</p>
    </div>
    <div class="bloc">
      <h3>Locataire</h3>
      <p><strong>${loc.raison_sociale || `${loc.prenom || ''} ${loc.nom || ''}`}</strong>
      ${loc.adresse ? `<br>${loc.adresse}` : ''}
      ${loc.code_postal || loc.ville ? `<br>${loc.code_postal || ''} ${loc.ville || ''}` : ''}
      ${loc.email ? `<br>${loc.email}` : ''}
      ${loc.telephone ? `<br>${loc.telephone}` : ''}</p>
    </div>
  </div>`

const bienBox = (bien) => `
  <div class="bien-box"><strong>Bien :</strong> ${bien.adresse}, ${bien.code_postal} ${bien.ville}${bien.surface_rdc ? ` — ${bien.surface_rdc} m²` : ''}</div>`

const ibanBlock = (soc, ref = '', label = 'Virement — IBAN') => soc?.iban ? `
  <div class="iban">
    <div><div class="lbl">${label}</div><div class="val">${soc.iban}</div></div>
    ${soc.bic ? `<div><div class="lbl">BIC</div><div class="val">${soc.bic}</div></div>` : ''}
    ${soc.nom_banque ? `<div><div class="lbl">Banque</div><div class="val">${soc.nom_banque}${soc.adresse_banque ? `<br><span style="font-size:10px;font-weight:400;opacity:.7">${soc.adresse_banque}</span>` : ''}</div></div>` : ''}
    ${ref ? `<div><div class="lbl">Référence virement</div><div class="val" style="color:#f59e0b">${ref}</div></div>` : ''}
  </div>` : ''

const footer = (soc) => `<div class="footer">${soc?.nom || 'WB Partners'}${soc?.siret ? ` — SIRET ${soc.siret}` : ''}${soc?.adresse ? ` — ${soc.adresse}, ${soc.code_postal || ''} ${soc.ville || ''}` : ''}</div>`

// ── Avis d'échéance ─────────────────────────────────────────

export const pdfAvisEcheance = (bail, bien, loc, soc, mois, annee) => {
  const loyerHT = getLoyerPourMois(bail, mois, annee)
  const total = loyerHT + bail.charges
  const periode = `${MONTHS[mois]} ${annee}`
  const ref = genRef(bail, mois, annee)
  openPrint(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Avis d'échéance</title><style>${baseStyle}</style></head><body>
    ${header(soc, "Avis d'Échéance", `<p>Période : ${periode}</p><p>Émis le ${new Date().toLocaleDateString('fr-FR')}</p><p class="num" style="font-size:11px;color:#3b82f6;font-weight:600">Réf : ${ref}</p>`)}
    ${parties(soc, loc)}
    ${bienBox(bien)}
    <table><thead><tr><th>Désignation</th><th style="text-align:right">HT</th><th style="text-align:right">TVA 20%</th><th style="text-align:right">TTC</th></tr></thead><tbody>
      <tr><td>Loyer hors charges</td><td style="text-align:right">${loyerHT.toFixed(2)} €</td><td style="text-align:right">${(loyerHT * 0.2).toFixed(2)} €</td><td style="text-align:right">${(loyerHT * 1.2).toFixed(2)} €</td></tr>
      ${bail.charges > 0 ? `<tr><td>Provisions sur charges</td><td style="text-align:right">${bail.charges.toFixed(2)} €</td><td style="text-align:right">${(bail.charges * 0.2).toFixed(2)} €</td><td style="text-align:right">${(bail.charges * 1.2).toFixed(2)} €</td></tr>` : ''}
      <tr class="tot"><td colspan="2"><strong>Total à régler avant le 1er ${periode}</strong></td><td></td><td style="text-align:right"><strong>${(total * 1.2).toFixed(2)} €</strong></td></tr>
    </tbody></table>
    ${ibanBlock(soc, ref)}
    <p class="note">Indice de révision : ${bail.indice_revision || 'ILC'} — Bail ${bail.type_bail || 'commercial'} du ${bail.date_debut || '—'}</p>
    ${footer(soc)}
  </body></html>`)
}

// ── Facture ──────────────────────────────────────────────────

export const pdfFacture = (bail, bien, loc, soc, mois, annee) => {
  const loyerHT = getLoyerPourMois(bail, mois, annee)
  const totalHT = loyerHT + bail.charges
  const totalTTC = totalHT * 1.2
  const periode = `${MONTHS[mois]} ${annee}`
  const ref = genRef(bail, mois, annee)
  const num = `FAC-${annee}${String(mois + 1).padStart(2, '0')}-${bail.id?.slice(0, 6).toUpperCase()}`
  openPrint(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Facture ${num}</title><style>${baseStyle}</style></head><body>
    ${header(soc, 'FACTURE', `<p class="num" style="font-size:14px;color:#3b82f6;font-weight:600">${num}</p><p>Date : ${new Date().toLocaleDateString('fr-FR')}</p><p>Période : ${periode}</p>`)}
    ${parties(soc, loc)}
    ${bienBox(bien)}
    <table><thead><tr><th>Désignation</th><th style="text-align:right">P.U. HT</th><th style="text-align:right">TVA 20%</th><th style="text-align:right">TTC</th></tr></thead><tbody>
      <tr><td>Loyer — ${periode}</td><td style="text-align:right">${loyerHT.toFixed(2)} €</td><td style="text-align:right">${(loyerHT * 0.2).toFixed(2)} €</td><td style="text-align:right">${(loyerHT * 1.2).toFixed(2)} €</td></tr>
      ${bail.charges > 0 ? `<tr><td>Charges</td><td style="text-align:right">${bail.charges.toFixed(2)} €</td><td style="text-align:right">${(bail.charges * 0.2).toFixed(2)} €</td><td style="text-align:right">${(bail.charges * 1.2).toFixed(2)} €</td></tr>` : ''}
      <tr class="tot"><td colspan="2"><strong>TOTAL</strong></td><td style="text-align:right"><strong>${(totalHT * 0.2).toFixed(2)} €</strong></td><td style="text-align:right"><strong>${totalTTC.toFixed(2)} €</strong></td></tr>
    </tbody></table>
    ${ibanBlock(soc, ref)}
    ${footer(soc)}
  </body></html>`)
}

// ── Quittance ────────────────────────────────────────────────

export const pdfQuittance = (bail, bien, loc, soc, transaction) => {
  const loyerHT = transaction.montant_loyer
  const chargesHT = transaction.montant_charges
  const totalHT = loyerHT + chargesHT
  const totalTTC = totalHT * 1.2
  const periode = `${MONTHS[transaction.mois]} ${transaction.annee}`
  const datePaiement = transaction.date_paiement ? new Date(transaction.date_paiement).toLocaleDateString('fr-FR') : '—'
  openPrint(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Quittance</title><style>${baseStyle}</style></head><body>
    ${header(soc, 'Quittance de Loyer', `<p>Période : ${periode}</p><p>Date de paiement : ${datePaiement}</p>`)}
    ${parties(soc, loc)}
    ${bienBox(bien)}
    <table><thead><tr><th>Désignation</th><th style="text-align:right">HT</th><th style="text-align:right">TVA 20%</th><th style="text-align:right">TTC</th></tr></thead><tbody>
      <tr><td>Loyer</td><td style="text-align:right">${loyerHT.toFixed(2)} €</td><td style="text-align:right">${(loyerHT * 0.2).toFixed(2)} €</td><td style="text-align:right">${(loyerHT * 1.2).toFixed(2)} €</td></tr>
      <tr><td>Charges</td><td style="text-align:right">${chargesHT.toFixed(2)} €</td><td style="text-align:right">${(chargesHT * 0.2).toFixed(2)} €</td><td style="text-align:right">${(chargesHT * 1.2).toFixed(2)} €</td></tr>
      <tr class="tot"><td colspan="2"><strong>TOTAL ACQUITTÉ</strong></td><td></td><td style="text-align:right"><strong>${totalTTC.toFixed(2)} €</strong></td></tr>
    </tbody></table>
    <p class="note">Le bailleur soussigné reconnaît avoir reçu la somme de ${totalTTC.toFixed(2)} € TTC au titre du loyer et des charges pour la période de ${periode}. Cette quittance ne libère le locataire que pour la période indiquée.</p>
    ${ibanBlock(soc, '', 'Compte du bailleur')}
    ${footer(soc)}
  </body></html>`)
}

// ── Relance amiable ──────────────────────────────────────────

export const pdfRelance = (bail, bien, loc, soc, transactions) => {
  const impayees = transactions.filter(t => t.bail_id === bail.id && t.statut === 'impayé')
  const totalDu = impayees.reduce((s, t) => s + t.montant_loyer + t.montant_charges, 0)
  const periodes = impayees.map(t => `${MONTHS[t.mois]} ${t.annee}`).join(', ')
  const refStr = impayees.map(t => genRef(bail, t.mois, t.annee)).join(' / ')
  openPrint(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Relance amiable</title><style>${baseStyle}</style></head><body>
    ${header(soc, 'Relance Amiable', `<p>${new Date().toLocaleDateString('fr-FR')}</p>`)}
    ${parties(soc, loc)}
    ${bienBox(bien)}
    <p style="margin-bottom:20px">Madame, Monsieur,</p>
    <p style="margin-bottom:16px">Sauf erreur de notre part, nous constatons que le(s) loyer(s) suivant(s) reste(nt) impayé(s) :</p>
    <p style="margin-bottom:16px;font-weight:700">Périodes concernées : ${periodes}</p>
    <p style="margin-bottom:16px;font-weight:700;font-size:16px;color:#dc2626">Montant total dû : ${(totalDu * 1.2).toFixed(2)} € TTC</p>
    <p style="margin-bottom:16px">Nous vous prions de bien vouloir régulariser cette situation dans les meilleurs délais.</p>
    ${ibanBlock(soc, refStr)}
    <p class="note">Ce courrier constitue une relance amiable. À défaut de règlement sous 8 jours, nous nous réservons le droit d'engager toute procédure utile.</p>
    ${footer(soc)}
  </body></html>`)
}

// ── Mise en demeure ──────────────────────────────────────────

export const pdfMiseEnDemeure = (bail, bien, loc, soc, transactions) => {
  const impayees = transactions.filter(t => t.bail_id === bail.id && t.statut === 'impayé')
  const totalDu = impayees.reduce((s, t) => s + t.montant_loyer + t.montant_charges, 0)
  const rows = impayees.map(t => `<tr><td>${MONTHS[t.mois]} ${t.annee}</td><td style="text-align:right">${t.montant_loyer.toFixed(2)} €</td><td style="text-align:right">${t.montant_charges.toFixed(2)} €</td><td style="text-align:right">${(t.montant_loyer + t.montant_charges).toFixed(2)} €</td></tr>`).join('')
  const refStr = impayees.map(t => genRef(bail, t.mois, t.annee)).join(' / ')
  openPrint(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Mise en demeure</title><style>${baseStyle} .urgent{background:#fee2e2;border:2px solid #dc2626;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;color:#dc2626;font-weight:700;font-size:14px}</style></head><body>
    ${header(soc, 'MISE EN DEMEURE', `<p>Lettre recommandée avec AR</p><p>${new Date().toLocaleDateString('fr-FR')}</p>`)}
    ${parties(soc, loc)}
    <div class="urgent">MISE EN DEMEURE DE PAYER</div>
    ${bienBox(bien)}
    <p style="margin-bottom:16px">Madame, Monsieur,</p>
    <p style="margin-bottom:16px">Malgré nos précédentes relances restées sans effet, nous constatons que les sommes suivantes restent dues :</p>
    <table><thead><tr><th>Période</th><th style="text-align:right">Loyer</th><th style="text-align:right">Charges</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${rows}<tr class="tot"><td colspan="3"><strong>TOTAL DÛ</strong></td><td style="text-align:right"><strong>${(totalDu * 1.2).toFixed(2)} € TTC</strong></td></tr></tbody>
    </table>
    <p style="margin-bottom:16px"><strong>Nous vous mettons en demeure de régler l'intégralité de cette somme sous 8 jours</strong> à compter de la réception de la présente.</p>
    <p style="margin-bottom:16px">À défaut, nous nous réservons le droit de faire application de la clause résolutoire du bail et d'engager toute procédure judiciaire utile.</p>
    ${ibanBlock(soc, refStr)}
    ${footer(soc)}
  </body></html>`)
}

// ── Commandement de payer ────────────────────────────────────

export const pdfCommandement = (bail, bien, loc, soc, transactions) => {
  const impayees = transactions.filter(t => t.bail_id === bail.id && t.statut === 'impayé')
  const totalDu = impayees.reduce((s, t) => s + t.montant_loyer + t.montant_charges, 0)
  const rows = impayees.map(t => `<tr><td>${MONTHS[t.mois]} ${t.annee}</td><td style="text-align:right">${(t.montant_loyer + t.montant_charges).toFixed(2)} €</td></tr>`).join('')
  openPrint(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Commandement de Payer</title><style>${baseStyle} .urgent{background:#dc2626;color:#fff;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center;font-weight:900;font-size:16px;letter-spacing:1px}</style></head><body>
    ${header(soc, 'COMMANDEMENT DE PAYER', `<p>Par acte d'huissier</p><p>${new Date().toLocaleDateString('fr-FR')}</p>`)}
    ${parties(soc, loc)}
    <div class="urgent">COMMANDEMENT DE PAYER — CLAUSE RÉSOLUTOIRE</div>
    ${bienBox(bien)}
    <p style="margin-bottom:16px">En vertu du bail en date du ${bail.date_debut || '—'}, il est fait commandement de payer les sommes suivantes :</p>
    <table><thead><tr><th>Période</th><th style="text-align:right">Montant HT</th></tr></thead>
      <tbody>${rows}<tr class="tot"><td><strong>TOTAL</strong></td><td style="text-align:right"><strong>${(totalDu * 1.2).toFixed(2)} € TTC</strong></td></tr></tbody>
    </table>
    <p style="margin-bottom:16px"><strong>Conformément à l'article L. 145-41 du Code de commerce</strong>, vous disposez d'un délai d'UN MOIS pour régler l'intégralité des sommes dues. Passé ce délai, la clause résolutoire sera acquise de plein droit.</p>
    ${footer(soc)}
  </body></html>`)
}

// ── Rapport portfolio ─────────────────────────────────────────

export const pdfPortfolio = (soc, biens, baux, transactions, locataires) => {
  const now = new Date()
  const year = now.getFullYear()

  const totalPatrimoine = biens.reduce((s, b) => s + (b.prix_achat || 0), 0)
  const totalLoyer = biens.reduce((s, b) => s + (b.loyer_mensuel || 0), 0) * 12
  const totalCashflow = biens.reduce((s, b) => s + cashflowMensuel(b), 0)
  const bauxActifs = baux.filter(b => b.actif)
  const tauxOcc = biens.length ? Math.round(bauxActifs.length / biens.length * 100) : 0

  const biensRows = biens.map(b => {
    const bail = baux.find(ba => ba.bien_id === b.id && ba.actif)
    const loc = bail ? locataires.find(l => l.id === bail.locataire_id) : null
    const rb = rendementBrut(b)
    const rn = rendementNet(b)
    const cf = cashflowMensuel(b)
    return `<tr>
      <td style="font-weight:700">${b.reference || b.adresse?.slice(0, 25) || '—'}</td>
      <td>${b.ville || '—'}</td>
      <td>${(b.surface_rdc || 0)} m²</td>
      <td>${loc?.raison_sociale || (loc ? `${loc.prenom} ${loc.nom}` : '<em style="color:#ef4444">Vacant</em>')}</td>
      <td style="text-align:right">${fmt(b.loyer_mensuel)}/mois</td>
      <td style="text-align:right">${rb !== null ? fmtPct(rb) : '—'}</td>
      <td style="text-align:right">${rn !== null ? fmtPct(rn) : '—'}</td>
      <td style="text-align:right;${cf >= 0 ? 'color:#22c55e' : 'color:#ef4444'}">${fmt(cf)}</td>
    </tr>`
  }).join('')

  const monthRows = MONTHS_SHORT.map((m, i) => {
    const paid = transactions.filter(t => t.annee === year && t.mois === i && t.statut === 'payé')
      .reduce((s, t) => s + (t.montant_loyer || 0), 0)
    const unpaid = transactions.filter(t => t.annee === year && t.mois === i && t.statut === 'impayé')
      .reduce((s, t) => s + (t.montant_loyer || 0), 0)
    return `<tr>
      <td>${m} ${year}</td>
      <td style="text-align:right;color:#22c55e">${fmt(paid)}</td>
      <td style="text-align:right;color:#ef4444">${fmt(unpaid)}</td>
    </tr>`
  }).join('')

  openPrint(`<!DOCTYPE html><html><head><style>${baseStyle}
    .cover{text-align:center;padding:120px 0 80px}.cover h1{font-size:32px;font-weight:900;letter-spacing:6px}.cover p{color:#64748b;font-size:14px;margin-top:8px}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}.summary .item{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center}.summary .item .val{font-size:22px;font-weight:800;color:#1a2d4e}.summary .item .lbl{font-size:10px;color:#94a3b8;text-transform:uppercase;margin-top:4px}
    .section-title{font-size:14px;font-weight:700;color:#1a2d4e;border-bottom:2px solid #1a2d4e;padding-bottom:6px;margin:32px 0 16px}
  </style></head><body>
    <div class="cover">
      <h1>${soc?.nom_affiche || soc?.nom || 'WB Partners'}</h1>
      <p>Rapport de patrimoine immobilier</p>
      <p style="color:#94a3b8;margin-top:24px">${now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </div>

    <div class="section-title">Synthèse financière</div>
    <div class="summary">
      <div class="item"><div class="val">${biens.length}</div><div class="lbl">Biens</div></div>
      <div class="item"><div class="val">${fmt(totalPatrimoine)}</div><div class="lbl">Patrimoine total</div></div>
      <div class="item"><div class="val">${fmt(totalLoyer)}</div><div class="lbl">Loyers annuels</div></div>
      <div class="item"><div class="val">${tauxOcc}%</div><div class="lbl">Taux d'occupation</div></div>
    </div>
    <div class="summary">
      <div class="item"><div class="val" style="color:#22c55e">${fmt(totalCashflow)}</div><div class="lbl">Cashflow mensuel</div></div>
      <div class="item"><div class="val">${bauxActifs.length}</div><div class="lbl">Baux actifs</div></div>
      <div class="item"><div class="val">${locataires.length}</div><div class="lbl">Locataires</div></div>
      <div class="item"><div class="val">${biens.length ? fmtPct(biens.reduce((s, b) => s + (rendementBrut(b) || 0), 0) / biens.length) : '—'}</div><div class="lbl">Rendement brut moyen</div></div>
    </div>

    <div class="section-title">Détail des biens</div>
    <table>
      <thead><tr><th>Référence</th><th>Ville</th><th>Surface</th><th>Locataire</th><th style="text-align:right">Loyer</th><th style="text-align:right">Rdt brut</th><th style="text-align:right">Rdt net</th><th style="text-align:right">Cashflow</th></tr></thead>
      <tbody>${biensRows}</tbody>
    </table>

    <div class="section-title">État des loyers ${year}</div>
    <table>
      <thead><tr><th>Mois</th><th style="text-align:right">Encaissé</th><th style="text-align:right">Impayé</th></tr></thead>
      <tbody>${monthRows}</tbody>
    </table>

    ${footer(soc)}
  </body></html>`)
}

// ── Fiche patrimoniale consolidée multi-sociétés ────────────

export const pdfFichePatrimoniale = ({ userName, userEmail, societes }) => {
  const now = new Date()
  const generatedAt = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const generatedAtFull = now.toLocaleString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  // Identifie la personne correspondant à l'utilisateur qui génère la fiche
  // (rapprochement par email puis par nom), pour produire sa quote-part
  // consolidée sur l'ensemble des sociétés.
  const toutesPersonnes = []
  societes.forEach(({ personnes }) => {
    (personnes || []).forEach(p => {
      if (!toutesPersonnes.some(x => x.id === p.id)) toutesPersonnes.push(p)
    })
  })
  const norm = (s) => (s || '').trim().toLowerCase()
  const moi = toutesPersonnes.find(p => userEmail && norm(p.email) === norm(userEmail))
    || toutesPersonnes.find(p => userName && norm(p.nom) === norm(userName))
    || null

  // Global totals across all sociétés — pondérés par la détention réelle.
  let totalBiens = 0
  let totalPatrimoine = 0
  let totalLoyer = 0
  let totalCashflow = 0
  let totalDette = 0
  let detentionPartielle = false
  societes.forEach(({ biens, bienActionnaires }) => {
    const agg = agregatsBiens(biens, bienActionnaires || [])
    totalBiens += biens.length
    totalPatrimoine += agg.valeurNette
    totalLoyer += agg.loyerMensuelNet * 12
    totalCashflow += agg.cashflowNet
    totalDette += agg.detteNette
    if (agg.partielle) detentionPartielle = true
  })
  const patrimoineNet = totalPatrimoine - totalDette

  // Quote-part consolidée de l'utilisateur, société par société.
  const maQuotePart = moi
    ? societes.map(({ societe: soc, biens, actionnaires, bienActionnaires }) => {
        const lien = (actionnaires || []).find(a => a.personne_id === moi.id)
        const qp = quotePartPersonne({
          personneId: moi.id,
          pctSociete: lien?.pourcentage || 0,
          biens,
          bienActionnaires: bienActionnaires || [],
        })
        return { soc, pct: Number(lien?.pourcentage || 0), qp }
      }).filter(r => r.pct > 0 || r.qp.valeurDirecte > 0)
    : []

  const totalMaQuotePart = maQuotePart.reduce((acc, r) => ({
    valeur: acc.valeur + r.qp.valeur,
    dette: acc.dette + r.qp.dette,
    net: acc.net + r.qp.patrimoineNet,
    loyer: acc.loyer + r.qp.loyerMensuel,
    cashflow: acc.cashflow + r.qp.cashflow,
  }), { valeur: 0, dette: 0, net: 0, loyer: 0, cashflow: 0 })

  const maQuotePartHtml = maQuotePart.length > 0 ? `
    <h3 class="section-title">Votre quote-part — ${moi.nom}</h3>
    <p style="font-size:11px;color:#64748b;margin-bottom:12px">
      Part vous revenant, cumulant votre participation au capital de chaque société
      et vos éventuelles détentions directes de biens.
    </p>
    <table style="margin-bottom:12px">
      <thead><tr>
        <th>Société</th>
        <th style="text-align:right">Participation</th>
        <th style="text-align:right">Valeur</th>
        <th style="text-align:right">Dette</th>
        <th style="text-align:right">Net</th>
        <th style="text-align:right">Cashflow/mois</th>
      </tr></thead>
      <tbody>
        ${maQuotePart.map(r => `<tr>
          <td><strong>${r.soc.nom_affiche || r.soc.nom}</strong></td>
          <td style="text-align:right;font-weight:700">${r.pct.toFixed(2)}%</td>
          <td style="text-align:right">${fmt(r.qp.valeur)}</td>
          <td style="text-align:right">${fmt(r.qp.dette)}</td>
          <td style="text-align:right;font-weight:600">${fmt(r.qp.patrimoineNet)}</td>
          <td style="text-align:right;${r.qp.cashflow >= 0 ? 'color:#22c55e' : 'color:#ef4444'}">${fmt(r.qp.cashflow)}</td>
        </tr>`).join('')}
        <tr class="tot">
          <td colspan="2"><strong>Total consolidé</strong></td>
          <td style="text-align:right"><strong>${fmt(totalMaQuotePart.valeur)}</strong></td>
          <td style="text-align:right"><strong>${fmt(totalMaQuotePart.dette)}</strong></td>
          <td style="text-align:right"><strong>${fmt(totalMaQuotePart.net)}</strong></td>
          <td style="text-align:right;${totalMaQuotePart.cashflow >= 0 ? 'color:#22c55e' : 'color:#ef4444'}"><strong>${fmt(totalMaQuotePart.cashflow)}</strong></td>
        </tr>
      </tbody>
    </table>
  ` : ''

  // Sommaire des sociétés couvertes.
  const sommaireHtml = `
    <h3 class="section-title">Périmètre du document</h3>
    <table style="margin-bottom:36px">
      <thead><tr>
        <th>Société</th>
        <th>Forme / RCS</th>
        <th style="text-align:right">Biens</th>
        <th style="text-align:right">Patrimoine net</th>
      </tr></thead>
      <tbody>
        ${societes.map(({ societe: soc, biens, bienActionnaires }) => {
          const a = agregatsBiens(biens, bienActionnaires || [])
          return `<tr>
            <td><strong>${soc.nom_affiche || soc.nom}</strong></td>
            <td><span style="font-size:10px;color:#64748b">${soc.rcs || soc.siret || '—'}</span></td>
            <td style="text-align:right">${biens.length}</td>
            <td style="text-align:right;font-weight:600">${fmt(a.patrimoineNet)}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  `

  // Per-société sections
  const societesHtml = societes.map(({ societe: soc, biens, actionnaires, baux, bienActionnaires, personnes }) => {
    const bact = bienActionnaires || []
    const pers = personnes || []
    const agg = agregatsBiens(biens, bact)
    const socPatrimoine = agg.valeurNette
    const socDette = agg.detteNette
    const socLoyer = agg.loyerMensuelNet * 12
    const socCashflow = agg.cashflowNet
    const socNet = socPatrimoine - socDette
    const bauxActifs = (baux || []).filter(b => b.actif)
    const tauxOcc = biens.length ? Math.round(bauxActifs.length / biens.length * 100) : 0

    const nomPersonne = (id, fallback) => pers.find(p => p.id === id)?.nom || fallback || '—'

    const totalPct = (actionnaires || []).reduce((s, a) => s + Number(a.pourcentage || 0), 0)
    const actionnariatHtml = (actionnaires && actionnaires.length > 0) ? `
      <h4 style="font-size:11px;font-weight:700;color:#1a2d4e;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Actionnariat</h4>
      <table style="margin-bottom:24px">
        <thead><tr>
          <th>Actionnaire</th>
          <th>Type</th>
          <th style="text-align:right">Participation</th>
          <th style="text-align:right">Via la société</th>
          <th style="text-align:right">Détention directe</th>
          <th style="text-align:right">Quote-part nette</th>
        </tr></thead>
        <tbody>
          ${actionnaires.map(a => {
            const p = pers.find(x => x.id === a.personne_id)
            const qp = quotePartPersonne({
              personneId: a.personne_id,
              pctSociete: a.pourcentage,
              biens,
              bienActionnaires: bact,
            })
            const nom = p?.nom || a.nom
            const siret = p?.siret || a.siret
            const type = p?.type || a.type
            const contact = [p?.email, p?.telephone].filter(Boolean).join(' · ')
            return `<tr>
              <td><strong>${nom}</strong>${siret ? `<br><span style="font-size:10px;color:#94a3b8">SIRET ${siret}</span>` : ''}${contact ? `<br><span style="font-size:10px;color:#94a3b8">${contact}</span>` : ''}${a.notes ? `<br><span style="font-size:10px;color:#94a3b8;font-style:italic">${a.notes}</span>` : ''}</td>
              <td><span style="font-size:10px;text-transform:uppercase;color:#64748b">${type === 'morale' ? 'P. morale' : 'P. physique'}</span></td>
              <td style="text-align:right;font-weight:700">${Number(a.pourcentage).toFixed(2)}%</td>
              <td style="text-align:right;color:#64748b">${fmt(qp.valeurIndirecte)}</td>
              <td style="text-align:right;color:#64748b">${qp.valeurDirecte > 0 ? fmt(qp.valeurDirecte) : '—'}</td>
              <td style="text-align:right;font-weight:600;color:#1a2d4e">${fmt(qp.patrimoineNet)}</td>
            </tr>`
          }).join('')}
          <tr class="tot"><td colspan="2"><strong>Total</strong></td>
            <td style="text-align:right"><strong style="color:${Math.abs(totalPct - 100) < 0.01 ? '#22c55e' : '#ef4444'}">${totalPct.toFixed(2)}%</strong></td>
            <td colspan="2"></td>
            <td style="text-align:right"><strong>${fmt(socNet * totalPct / 100)}</strong></td>
          </tr>
        </tbody>
      </table>
    ` : '<p style="font-style:italic;color:#94a3b8;font-size:11px;margin-bottom:24px">Aucun actionnaire enregistré pour cette société.</p>'

    // Co-détenteurs de biens hors actionnariat de la société.
    const codetenteurs = bact.filter(x => !(actionnaires || []).some(a => a.personne_id === x.personne_id))
    const codetenteursHtml = codetenteurs.length > 0 ? `
      <h4 style="font-size:11px;font-weight:700;color:#1a2d4e;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Co-détenteurs de biens (hors actionnariat)</h4>
      <table style="margin-bottom:24px">
        <thead><tr>
          <th>Détenteur</th>
          <th>Bien</th>
          <th style="text-align:right">Part du bien</th>
          <th style="text-align:right">Valeur détenue</th>
        </tr></thead>
        <tbody>
          ${codetenteurs.map(x => {
            const b = biens.find(y => y.id === x.bien_id)
            const part = Number(x.pourcentage || 0) / 100
            return `<tr>
              <td><strong>${nomPersonne(x.personne_id, x.nom_externe)}</strong>${x.notes ? `<br><span style="font-size:10px;color:#94a3b8;font-style:italic">${x.notes}</span>` : ''}</td>
              <td>${b?.reference || b?.adresse?.slice(0, 30) || '—'}</td>
              <td style="text-align:right;font-weight:700">${Number(x.pourcentage).toFixed(2)}%</td>
              <td style="text-align:right">${fmt((b?.prix_achat || 0) * part)}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    ` : ''

    const biensHtml = biens.length > 0 ? `
      <h4 style="font-size:11px;font-weight:700;color:#1a2d4e;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Biens détenus (${biens.length})</h4>
      <table style="margin-bottom:24px">
        <thead><tr>
          <th>Référence / Adresse</th>
          <th>Ville</th>
          <th style="text-align:right">Détention</th>
          <th style="text-align:right">Acquisition</th>
          <th style="text-align:right">Emprunt</th>
          <th style="text-align:right">Loyer/mois</th>
          <th style="text-align:right">Cashflow</th>
        </tr></thead>
        <tbody>
          ${biens.map(b => {
            const part = partSociete(b.id, bact)
            const pct = part * 100
            const acquis = estAcquis(b)
            // Un bien sous compromis n'apporte aucun flux : on l'affiche pour
            // mémoire, sans montants, et il est exclu du sous-total.
            if (!acquis) {
              return `<tr style="color:#94a3b8">
            <td><strong>${b.reference || b.adresse?.slice(0, 30) || '—'}</strong><br><span style="font-size:10px;color:#f59e0b">Sous compromis — signature prévue le ${b.date_acquisition ? new Date(b.date_acquisition).toLocaleDateString('fr-FR') : '—'}</span></td>
            <td>${b.ville || '—'}</td>
            <td style="text-align:right">${pct.toFixed(2)}%</td>
            <td colspan="4" style="text-align:center;font-style:italic;font-size:10px">Non comptabilisé — acte non signé</td>
          </tr>`
            }
            return `<tr>
            <td><strong>${b.reference || b.adresse?.slice(0, 30) || '—'}</strong>${b.reference ? `<br><span style="font-size:10px;color:#94a3b8">${b.adresse?.slice(0, 40) || ''}</span>` : ''}</td>
            <td>${b.ville || '—'}</td>
            <td style="text-align:right;${pct < 99.99 ? 'font-weight:700;color:#f59e0b' : 'color:#94a3b8'}">${pct.toFixed(2)}%</td>
            <td style="text-align:right">${b.prix_achat ? fmt(b.prix_achat * part) : '—'}</td>
            <td style="text-align:right">${b.montant_emprunt ? fmt(b.montant_emprunt * part) : '—'}</td>
            <td style="text-align:right">${b.loyer_mensuel ? fmt(b.loyer_mensuel * part) : '—'}</td>
            <td style="text-align:right;${cashflowMensuel(b) >= 0 ? 'color:#22c55e' : 'color:#ef4444'}">${fmt(cashflowMensuel(b) * part)}</td>
          </tr>`
          }).join('')}
          <tr class="tot">
            <td colspan="3"><strong>Sous-total société</strong></td>
            <td style="text-align:right"><strong>${fmt(socPatrimoine)}</strong></td>
            <td style="text-align:right"><strong>${fmt(socDette)}</strong></td>
            <td style="text-align:right"><strong>${fmt(socLoyer / 12)}</strong></td>
            <td style="text-align:right;${socCashflow >= 0 ? 'color:#22c55e' : 'color:#ef4444'}"><strong>${fmt(socCashflow)}</strong></td>
          </tr>
        </tbody>
      </table>
      ${agg.partielle ? `<p style="font-size:10px;color:#94a3b8;font-style:italic;margin:-16px 0 8px">Les montants sont ramenés à la quote-part réellement détenue par la société. Valeur à 100 % des biens acquis : ${fmt(agg.valeurBrute)}.</p>` : ''}
      ${agg.nbEnCours > 0 ? `<p style="font-size:10px;color:#f59e0b;font-style:italic;margin:-8px 0 24px">${agg.nbEnCours} bien${agg.nbEnCours > 1 ? 's' : ''} sous compromis (${fmt(agg.valeurEnCours)} à l'acquisition, ${fmt(agg.engagementEnCours)} d'emprunt prévu) — exclu${agg.nbEnCours > 1 ? 's' : ''} des totaux tant que l'acte n'est pas signé.</p>` : ''}
    ` : '<p style="font-style:italic;color:#94a3b8;font-size:11px;margin-bottom:24px">Aucun bien enregistré pour cette société.</p>'

    // Fiche d'identité juridique complète de la société.
    const idLine = (label, value) => value
      ? `<div class="id-row"><span class="id-lbl">${label}</span><span class="id-val">${value}</span></div>`
      : ''
    const adresseComplete = [
      soc.adresse,
      [soc.code_postal, soc.ville].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ')

    return `
      <div class="soc-section">
        <h3 class="soc-title">${soc.nom_affiche || soc.nom}</h3>

        <h4 class="sub-title">Identité juridique</h4>
        <div class="id-grid">
          ${idLine('Dénomination', soc.nom)}
          ${idLine('Capital social', soc.capital)}
          ${idLine('SIRET', soc.siret)}
          ${idLine('RCS', soc.rcs)}
          ${idLine('Code APE', soc.ape)}
          ${idLine('TVA intracom.', soc.tva_intracommunautaire)}
          ${idLine('Siège social', adresseComplete)}
          ${idLine('Téléphone', soc.telephone)}
          ${idLine('Email', soc.email)}
          ${idLine('Banque', soc.nom_banque)}
          ${idLine('IBAN', soc.iban)}
          ${idLine('BIC', soc.bic)}
        </div>

        <h4 class="sub-title">Synthèse patrimoniale</h4>
        <div class="soc-summary">
          <div><div class="lbl">Biens acquis</div><div class="val">${biens.length - agg.nbEnCours}</div></div>
          <div><div class="lbl">Valeur d'acquisition</div><div class="val">${fmt(socPatrimoine)}</div></div>
          <div><div class="lbl">Encours emprunt</div><div class="val">${fmt(socDette)}</div></div>
          <div><div class="lbl">Patrimoine net</div><div class="val" style="color:#1a2d4e">${fmt(socNet)}</div></div>
          <div><div class="lbl">Loyer annuel</div><div class="val">${fmt(socLoyer)}</div></div>
          <div><div class="lbl">Taux d'occupation</div><div class="val">${tauxOcc}%</div></div>
        </div>
        ${actionnariatHtml}
        ${codetenteursHtml}
        ${biensHtml}
      </div>
    `
  }).join('')

  openPrint(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Fiche patrimoniale</title><style>${baseStyle}
    .cover{text-align:center;padding:100px 0 60px}
    .cover h1{font-size:30px;font-weight:900;letter-spacing:4px}
    .cover h2{font-size:16px;font-weight:600;color:#64748b;margin-top:12px}
    .cover .meta{color:#94a3b8;font-size:12px;margin-top:32px}
    .global-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:36px}
    .global-summary .item{background:#1a2d4e;color:#fff;border-radius:10px;padding:18px;text-align:center}
    .global-summary .item .val{font-size:22px;font-weight:800}
    .global-summary .item .lbl{font-size:10px;opacity:.7;text-transform:uppercase;margin-top:4px;letter-spacing:.5px}
    .global-summary .item.accent{background:#eff6ff;color:#1a2d4e}
    .soc-section{margin-bottom:48px;page-break-inside:avoid}
    .soc-title{font-size:18px;font-weight:800;color:#1a2d4e;border-bottom:3px solid #1a2d4e;padding-bottom:8px;margin-bottom:8px}
    .soc-summary{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:24px}
    .soc-summary > div{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;text-align:center}
    .soc-summary .lbl{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
    .soc-summary .val{font-size:14px;font-weight:700;color:#1a2d4e;margin-top:2px}
    .section-title{font-size:14px;font-weight:700;color:#1a2d4e;border-bottom:2px solid #1a2d4e;padding-bottom:6px;margin:32px 0 16px}
    .sub-title{font-size:11px;font-weight:700;color:#1a2d4e;margin:0 0 8px;text-transform:uppercase;letter-spacing:.5px}
    .id-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 28px;margin-bottom:24px}
    .id-row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:11px}
    .id-lbl{color:#94a3b8;text-transform:uppercase;font-size:9px;letter-spacing:.5px;padding-top:2px;white-space:nowrap}
    .id-val{color:#1a2d4e;font-weight:600;text-align:right;word-break:break-word}
    .cover-id{max-width:420px;margin:36px auto 0;text-align:left}
    .cover-id .id-row{border-bottom:1px solid #e2e8f0}
    @media print{.soc-section{page-break-inside:avoid}.cover{page-break-after:always}}
  </style></head><body>

    <div class="cover">
      <img src="https://wbpartners.fr/logo.png" alt="" width="64" height="64" style="border-radius:14px;margin-bottom:20px" />
      <h1>FICHE PATRIMONIALE</h1>
      <h2>${userName || 'Patrimoine consolidé'}</h2>
      <div class="cover-id">
        <div class="id-row"><span class="id-lbl">Établie pour</span><span class="id-val">${userName || '—'}</span></div>
        ${userEmail ? `<div class="id-row"><span class="id-lbl">Contact</span><span class="id-val">${userEmail}</span></div>` : ''}
        <div class="id-row"><span class="id-lbl">Éditée le</span><span class="id-val">${generatedAtFull}</span></div>
        <div class="id-row"><span class="id-lbl">Périmètre</span><span class="id-val">${societes.length} société${societes.length > 1 ? 's' : ''} — ${totalBiens} bien${totalBiens > 1 ? 's' : ''}</span></div>
        <div class="id-row"><span class="id-lbl">Patrimoine net</span><span class="id-val">${fmt(patrimoineNet)}</span></div>
        ${moi ? `<div class="id-row"><span class="id-lbl">Votre quote-part</span><span class="id-val">${fmt(totalMaQuotePart.net)}</span></div>` : ''}
      </div>
      <p class="meta" style="margin-top:40px">Document confidentiel — usage interne</p>
    </div>

    <h3 class="section-title">Synthèse globale</h3>
    <div class="global-summary">
      <div class="item"><div class="val">${fmt(totalPatrimoine)}</div><div class="lbl">Valeur d'acquisition</div></div>
      <div class="item"><div class="val">${fmt(totalDette)}</div><div class="lbl">Encours emprunt</div></div>
      <div class="item accent"><div class="val">${fmt(patrimoineNet)}</div><div class="lbl">Patrimoine net</div></div>
      <div class="item"><div class="val">${fmt(totalLoyer)}</div><div class="lbl">Loyers annuels</div></div>
      <div class="item"><div class="val" style="${totalCashflow >= 0 ? 'color:#22c55e' : 'color:#ef4444'}">${fmt(totalCashflow)}</div><div class="lbl">Cashflow mensuel</div></div>
      <div class="item"><div class="val">${totalBiens}</div><div class="lbl">Biens totaux</div></div>
    </div>
    ${detentionPartielle ? `<p style="font-size:10px;color:#94a3b8;font-style:italic;margin:-24px 0 24px">Certains biens ne sont pas détenus à 100 % : tous les montants ci-dessus sont ramenés à la quote-part réellement détenue par chaque société.</p>` : ''}

    ${sommaireHtml}

    ${maQuotePartHtml}

    ${societesHtml}

    <div class="footer">
      Fiche patrimoniale éditée par WB Partners le ${generatedAtFull}${userName ? ` pour ${userName}` : ''}<br>
      <span style="font-size:9px">Les montants reflètent les valeurs d'acquisition enregistrées, ramenées à la quote-part réellement détenue, et excluent les biens dont l'acte n'est pas signé. Les valeurs de marché actuelles peuvent différer. Document sans valeur contractuelle.</span>
    </div>
  </body></html>`)
}
