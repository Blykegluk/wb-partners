/**
 * Rendement brut = (loyer mensuel × 12) / prix d'achat
 */
export const rendementBrut = (bien) => {
  if (!bien.prix_achat || !bien.loyer_mensuel) return null
  return (bien.loyer_mensuel * 12) / bien.prix_achat
}

/**
 * Rendement net = ((loyer - charges - annuités - TF/12) × 12) / apport
 */
export const rendementNet = (bien) => {
  const apport = bien.apport || bien.prix_achat
  if (!apport || !bien.loyer_mensuel) return null
  const mensuelNet =
    bien.loyer_mensuel -
    (bien.charges || 0) -
    (bien.annuites || 0) -
    (bien.taxe_fonciere || 0) / 12
  return (mensuelNet * 12) / apport
}

/**
 * Cashflow mensuel = loyer - charges - annuités - TF/12
 */
export const cashflowMensuel = (bien) => {
  return (
    (bien.loyer_mensuel || 0) -
    (bien.charges || 0) -
    (bien.annuites || 0) -
    (bien.taxe_fonciere || 0) / 12
  )
}
