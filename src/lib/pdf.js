import { MONTHS, MONTHS_SHORT, getLoyerPourMois, fmt, fmtPct } from './utils'
import { rendementBrut, rendementNet, cashflowMensuel } from './calculs'

// Print the generated HTML by injecting it into an off-screen iframe and
// calling print() on its contentWindow. Crucial implementation details:
//   1. The iframe MUST have real dimensions (a 0x0 iframe doesn't render
//      content, so print() prints a blank page or fails silently).
//   2. We position it off-screen (-99999px) instead of using display:none
//      or visibility:hidden — those can also prevent content rendering.
//   3. We use srcdoc instead of document.write — modern, fires 'load'
//      reliably across all browsers.
//   4. The 'load' listener is attached BEFORE setting srcdoc, otherwise
//      we may miss the event.
//   5. Logs to console so the user can diagnose if something still fails.
const openPrint = (html) => {
  console.log('[WB Print] openPrint called, HTML length:', html.length)

  // Clean up leftover iframes from previous runs.
  document.querySelectorAll('iframe[data-wb-print]').forEach(el => el.remove())

  const iframe = document.createElement('iframe')
  iframe.setAttribute('data-wb-print', '1')
  // A4 dimensions, positioned off-screen so the user never sees it.
  iframe.style.cssText = 'position:fixed;top:0;left:-99999px;width:21cm;height:29.7cm;border:0;'

  let printed = false
  const triggerPrint = (reason) => {
    if (printed) return
    printed = true
    console.log('[WB Print] Triggering print (' + reason + ')')
    try {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      console.log('[WB Print] print() returned normally')
    } catch (e) {
      console.error('[WB Print] print() failed:', e)
      alert("Impossible d'imprimer : " + (e?.message || 'erreur inconnue'))
    }
    // Leave the iframe alive long enough for the print dialog to grab it.
    setTimeout(() => iframe.remove(), 5000)
  }

  // Attach BEFORE appending and setting srcdoc.
  iframe.addEventListener('load', () => triggerPrint('load event'))

  document.body.appendChild(iframe)
  iframe.srcdoc = html

  // Hard safety fallback if 'load' somehow never fires.
  setTimeout(() => triggerPrint('timeout fallback'), 2500)
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

export const pdfFichePatrimoniale = ({ userName, societes }) => {
  const now = new Date()
  const generatedAt = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  // Global totals across all sociétés
  let totalBiens = 0
  let totalPatrimoine = 0
  let totalLoyer = 0
  let totalCashflow = 0
  let totalDette = 0
  societes.forEach(({ biens }) => {
    biens.forEach(b => {
      totalBiens++
      totalPatrimoine += b.prix_achat || 0
      totalLoyer += (b.loyer_mensuel || 0) * 12
      totalCashflow += cashflowMensuel(b)
      totalDette += b.montant_emprunt || 0
    })
  })
  const patrimoineNet = totalPatrimoine - totalDette

  // Per-société sections
  const societesHtml = societes.map(({ societe: soc, biens, actionnaires, baux }) => {
    const socPatrimoine = biens.reduce((s, b) => s + (b.prix_achat || 0), 0)
    const socLoyer = biens.reduce((s, b) => s + (b.loyer_mensuel || 0), 0) * 12
    const socDette = biens.reduce((s, b) => s + (b.montant_emprunt || 0), 0)
    const socCashflow = biens.reduce((s, b) => s + cashflowMensuel(b), 0)
    const bauxActifs = (baux || []).filter(b => b.actif)
    const tauxOcc = biens.length ? Math.round(bauxActifs.length / biens.length * 100) : 0

    const totalPct = (actionnaires || []).reduce((s, a) => s + Number(a.pourcentage || 0), 0)
    const actionnariatHtml = (actionnaires && actionnaires.length > 0) ? `
      <h4 style="font-size:11px;font-weight:700;color:#1a2d4e;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Actionnariat</h4>
      <table style="margin-bottom:24px">
        <thead><tr>
          <th>Actionnaire</th>
          <th>Type</th>
          <th style="text-align:right">Participation</th>
          <th style="text-align:right">Quote-part nette</th>
        </tr></thead>
        <tbody>
          ${actionnaires.map(a => {
            const quotePart = (socPatrimoine - socDette) * Number(a.pourcentage || 0) / 100
            return `<tr>
              <td><strong>${a.nom}</strong>${a.siret ? `<br><span style="font-size:10px;color:#94a3b8">SIRET ${a.siret}</span>` : ''}${a.notes ? `<br><span style="font-size:10px;color:#94a3b8;font-style:italic">${a.notes}</span>` : ''}</td>
              <td><span style="font-size:10px;text-transform:uppercase;color:#64748b">${a.type === 'morale' ? 'P. morale' : 'P. physique'}</span></td>
              <td style="text-align:right;font-weight:700">${Number(a.pourcentage).toFixed(2)}%</td>
              <td style="text-align:right;font-weight:600;color:#1a2d4e">${fmt(quotePart)}</td>
            </tr>`
          }).join('')}
          <tr class="tot"><td colspan="2"><strong>Total</strong></td>
            <td style="text-align:right"><strong style="color:${Math.abs(totalPct - 100) < 0.01 ? '#22c55e' : '#ef4444'}">${totalPct.toFixed(2)}%</strong></td>
            <td style="text-align:right"><strong>${fmt((socPatrimoine - socDette) * totalPct / 100)}</strong></td>
          </tr>
        </tbody>
      </table>
    ` : '<p style="font-style:italic;color:#94a3b8;font-size:11px;margin-bottom:24px">Aucun actionnaire enregistré pour cette société.</p>'

    const biensHtml = biens.length > 0 ? `
      <h4 style="font-size:11px;font-weight:700;color:#1a2d4e;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Biens détenus (${biens.length})</h4>
      <table style="margin-bottom:24px">
        <thead><tr>
          <th>Référence / Adresse</th>
          <th>Ville</th>
          <th style="text-align:right">Acquisition</th>
          <th style="text-align:right">Emprunt</th>
          <th style="text-align:right">Loyer/mois</th>
          <th style="text-align:right">Cashflow</th>
        </tr></thead>
        <tbody>
          ${biens.map(b => `<tr>
            <td><strong>${b.reference || b.adresse?.slice(0, 30) || '—'}</strong>${b.reference ? `<br><span style="font-size:10px;color:#94a3b8">${b.adresse?.slice(0, 40) || ''}</span>` : ''}</td>
            <td>${b.ville || '—'}</td>
            <td style="text-align:right">${b.prix_achat ? fmt(b.prix_achat) : '—'}</td>
            <td style="text-align:right">${b.montant_emprunt ? fmt(b.montant_emprunt) : '—'}</td>
            <td style="text-align:right">${b.loyer_mensuel ? fmt(b.loyer_mensuel) : '—'}</td>
            <td style="text-align:right;${cashflowMensuel(b) >= 0 ? 'color:#22c55e' : 'color:#ef4444'}">${fmt(cashflowMensuel(b))}</td>
          </tr>`).join('')}
          <tr class="tot">
            <td colspan="2"><strong>Sous-total société</strong></td>
            <td style="text-align:right"><strong>${fmt(socPatrimoine)}</strong></td>
            <td style="text-align:right"><strong>${fmt(socDette)}</strong></td>
            <td style="text-align:right"><strong>${fmt(socLoyer / 12)}</strong></td>
            <td style="text-align:right;${socCashflow >= 0 ? 'color:#22c55e' : 'color:#ef4444'}"><strong>${fmt(socCashflow)}</strong></td>
          </tr>
        </tbody>
      </table>
    ` : '<p style="font-style:italic;color:#94a3b8;font-size:11px;margin-bottom:24px">Aucun bien enregistré pour cette société.</p>'

    return `
      <div class="soc-section">
        <h3 class="soc-title">${soc.nom_affiche || soc.nom}</h3>
        <div class="soc-identity">
          ${soc.siret ? `<span><strong>SIRET</strong> ${soc.siret}</span>` : ''}
          ${soc.rcs ? `<span><strong>RCS</strong> ${soc.rcs}</span>` : ''}
          ${soc.capital ? `<span><strong>Capital</strong> ${soc.capital}</span>` : ''}
          ${soc.adresse ? `<span>${soc.adresse}${soc.code_postal || soc.ville ? `, ${soc.code_postal || ''} ${soc.ville || ''}` : ''}</span>` : ''}
        </div>
        <div class="soc-summary">
          <div><div class="lbl">Biens</div><div class="val">${biens.length}</div></div>
          <div><div class="lbl">Valeur d'acquisition</div><div class="val">${fmt(socPatrimoine)}</div></div>
          <div><div class="lbl">Encours emprunt</div><div class="val">${fmt(socDette)}</div></div>
          <div><div class="lbl">Patrimoine net</div><div class="val" style="color:#1a2d4e">${fmt(socPatrimoine - socDette)}</div></div>
          <div><div class="lbl">Loyer annuel</div><div class="val">${fmt(socLoyer)}</div></div>
          <div><div class="lbl">Taux d'occupation</div><div class="val">${tauxOcc}%</div></div>
        </div>
        ${actionnariatHtml}
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
    .soc-identity{display:flex;gap:18px;flex-wrap:wrap;color:#64748b;font-size:11px;margin-bottom:18px}
    .soc-identity strong{color:#94a3b8;font-size:10px;text-transform:uppercase;margin-right:4px}
    .soc-summary{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:24px}
    .soc-summary > div{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;text-align:center}
    .soc-summary .lbl{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
    .soc-summary .val{font-size:14px;font-weight:700;color:#1a2d4e;margin-top:2px}
    @media print{.soc-section{page-break-inside:avoid}}
  </style></head><body>

    <div class="cover">
      <h1>FICHE PATRIMONIALE</h1>
      <h2>${userName || 'Patrimoine consolidé'}</h2>
      <p class="meta">Éditée le ${generatedAt}</p>
      <p class="meta">${societes.length} société${societes.length > 1 ? 's' : ''} — ${totalBiens} bien${totalBiens > 1 ? 's' : ''} enregistré${totalBiens > 1 ? 's' : ''}</p>
    </div>

    <h3 style="font-size:14px;font-weight:700;color:#1a2d4e;border-bottom:2px solid #1a2d4e;padding-bottom:6px;margin:32px 0 16px">Synthèse globale</h3>
    <div class="global-summary">
      <div class="item"><div class="val">${fmt(totalPatrimoine)}</div><div class="lbl">Valeur d'acquisition</div></div>
      <div class="item"><div class="val">${fmt(totalDette)}</div><div class="lbl">Encours emprunt</div></div>
      <div class="item accent"><div class="val">${fmt(patrimoineNet)}</div><div class="lbl">Patrimoine net</div></div>
      <div class="item"><div class="val">${fmt(totalLoyer)}</div><div class="lbl">Loyers annuels</div></div>
      <div class="item"><div class="val" style="${totalCashflow >= 0 ? 'color:#22c55e' : 'color:#ef4444'}">${fmt(totalCashflow)}</div><div class="lbl">Cashflow mensuel</div></div>
      <div class="item"><div class="val">${totalBiens}</div><div class="lbl">Biens totaux</div></div>
    </div>

    ${societesHtml}

    <div class="footer">Document généré par WB Partners — ${generatedAt}<br>
    <span style="font-size:9px">Les montants reflètent les valeurs d'acquisition enregistrées. Les valeurs de marché actuelles peuvent différer.</span></div>
  </body></html>`)
}
