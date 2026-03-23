import { useState } from 'react'
import { RefreshCw, Check, History } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { fmt, fmtDate } from '../lib/utils'
import { PageHeader, Card, Field, Grid2, Btn, Badge, Empty, Modal } from '../components/UI'

export default function Revisions() {
  const { baux, biens, locataires, revisions, selected, canEdit, reload } = useSociete()
  const [open, setOpen] = useState(null) // bail id being revised
  const [ancienIndice, setAncienIndice] = useState('')
  const [nouvelIndice, setNouvelIndice] = useState('')
  const [saving, setSaving] = useState(false)

  // Detect baux due for revision (within 90 days)
  const now = new Date()
  const bauxActifs = baux.filter(b => b.actif && b.date_revision_anniversaire)
  const dues = bauxActifs.filter(b => {
    const rev = new Date(b.date_revision_anniversaire)
    // Set to current year or next occurrence
    rev.setFullYear(now.getFullYear())
    if (rev < new Date(now.getFullYear(), now.getMonth() - 1, 1)) rev.setFullYear(now.getFullYear() + 1)
    const diff = (rev - now) / (1000 * 60 * 60 * 24)
    return diff <= 90 && diff >= -30
  })

  const getInfo = (bail) => {
    const bien = biens.find(b => b.id === bail.bien_id)
    const loc = locataires.find(l => l.id === bail.locataire_id)
    return { bien, loc }
  }

  const nextRevisionDate = (bail) => {
    const rev = new Date(bail.date_revision_anniversaire)
    rev.setFullYear(now.getFullYear())
    if (rev < new Date(now.getFullYear(), now.getMonth() - 1, 1)) rev.setFullYear(now.getFullYear() + 1)
    return rev
  }

  const daysUntil = (bail) => {
    const d = nextRevisionDate(bail)
    return Math.round((d - now) / (1000 * 60 * 60 * 24))
  }

  const openRevision = (bail) => {
    setOpen(bail.id)
    setAncienIndice('')
    setNouvelIndice('')
  }

  const applyRevision = async () => {
    const bail = baux.find(b => b.id === open)
    if (!bail || !ancienIndice || !nouvelIndice) return
    setSaving(true)

    const ai = parseFloat(ancienIndice)
    const ni = parseFloat(nouvelIndice)
    const nouveauLoyer = bail.loyer_ht * (ni / ai)

    // Insert revision record
    await supabase.from('revisions_loyer').insert({
      societe_id: selected.id,
      bail_id: bail.id,
      date_revision: new Date().toISOString().slice(0, 10),
      indice_type: bail.indice_revision || 'ILC',
      ancien_indice: ai,
      nouvel_indice: ni,
      ancien_loyer: bail.loyer_ht,
      nouveau_loyer: Math.round(nouveauLoyer * 100) / 100,
      appliquee: true,
    })

    // Update bail loyer_ht
    await supabase.from('baux').update({ loyer_ht: Math.round(nouveauLoyer * 100) / 100 }).eq('id', bail.id)

    setSaving(false)
    setOpen(null)
    reload()
  }

  return (
    <div>
      <PageHeader title="Révisions de loyer" sub="Gestion des révisions annuelles" />

      {/* Baux à réviser */}
      <h3 className="text-sm font-bold text-navy mb-3 flex items-center gap-2">
        <RefreshCw size={16} /> Baux à réviser
        {dues.length > 0 && <span className="bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full">{dues.length}</span>}
      </h3>

      {dues.length === 0 ? (
        <Card className="mb-8">
          <p className="text-sm text-gray-400 text-center py-4">Aucun bail à réviser dans les 90 prochains jours.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden mb-8">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Locataire', 'Bien', 'Loyer actuel', 'Indice', 'Date révision', 'Jours', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dues.map(bail => {
                const { bien, loc } = getInfo(bail)
                const days = daysUntil(bail)
                return (
                  <tr key={bail.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm font-semibold text-navy">
                      {loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{bien?.reference || bien?.adresse?.slice(0, 25) || '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold">{fmt(bail.loyer_ht)}</td>
                    <td className="px-4 py-3"><Badge value={bail.indice_revision || 'ILC'} /></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(bail.date_revision_anniversaire)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-semibold ${days <= 0 ? 'text-red-600' : days <= 30 ? 'text-orange-500' : 'text-yellow-600'}`}>
                        {days <= 0 ? `${Math.abs(days)}j en retard` : `J-${days}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canEdit && (
                        <Btn className="!px-3 !py-1 !text-xs" onClick={() => openRevision(bail)}>Réviser</Btn>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Historique des révisions */}
      <h3 className="text-sm font-bold text-navy mb-3 flex items-center gap-2">
        <History size={16} /> Historique
      </h3>

      {revisions.length === 0 ? (
        <Empty icon={<History size={40} />} text="Aucune révision effectuée." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Date', 'Locataire', 'Indice', 'Ancien indice', 'Nouvel indice', 'Ancien loyer', 'Nouveau loyer', 'Variation'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {revisions.map(r => {
                const bail = baux.find(b => b.id === r.bail_id)
                const { loc } = bail ? getInfo(bail) : { loc: null }
                const variation = r.ancien_loyer > 0 ? ((r.nouveau_loyer - r.ancien_loyer) / r.ancien_loyer * 100).toFixed(2) : 0
                return (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(r.date_revision)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-navy">
                      {loc?.raison_sociale || `${loc?.prenom || ''} ${loc?.nom || ''}`.trim() || '—'}
                    </td>
                    <td className="px-4 py-3"><Badge value={r.indice_type} /></td>
                    <td className="px-4 py-3 text-sm">{r.ancien_indice}</td>
                    <td className="px-4 py-3 text-sm">{r.nouvel_indice}</td>
                    <td className="px-4 py-3 text-sm">{fmt(r.ancien_loyer)}</td>
                    <td className="px-4 py-3 text-sm font-semibold">{fmt(r.nouveau_loyer)}</td>
                    <td className="px-4 py-3 text-sm text-green-600">+{variation}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Revision modal */}
      {open && (
        <Modal title="Appliquer une révision" onClose={() => setOpen(null)}>
          {(() => {
            const bail = baux.find(b => b.id === open)
            if (!bail) return null
            const ai = parseFloat(ancienIndice) || 0
            const ni = parseFloat(nouvelIndice) || 0
            const preview = ai > 0 ? bail.loyer_ht * (ni / ai) : 0
            return (
              <div>
                <p className="text-sm text-gray-500 mb-4">
                  Loyer actuel : <strong className="text-navy">{fmt(bail.loyer_ht)}</strong> — Indice : <strong>{bail.indice_revision || 'ILC'}</strong>
                </p>
                <Grid2>
                  <Field label="Ancien indice" type="number" value={ancienIndice} onChange={e => setAncienIndice(e.target.value)} placeholder="ex: 132.47" />
                  <Field label="Nouvel indice" type="number" value={nouvelIndice} onChange={e => setNouvelIndice(e.target.value)} placeholder="ex: 135.20" />
                </Grid2>
                {ai > 0 && ni > 0 && (
                  <Card className="bg-blue-50 border border-blue-100 mt-4">
                    <p className="text-sm text-gray-600">Nouveau loyer calculé :</p>
                    <p className="text-2xl font-bold text-navy">{fmt(Math.round(preview * 100) / 100)}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Variation : +{((ni / ai - 1) * 100).toFixed(2)}%
                    </p>
                  </Card>
                )}
                <div className="flex gap-2 mt-6">
                  <Btn onClick={applyRevision} disabled={!ai || !ni || saving}>
                    <Check size={14} className="mr-1" />{saving ? 'Application...' : 'Appliquer'}
                  </Btn>
                  <Btn variant="ghost" onClick={() => setOpen(null)}>Annuler</Btn>
                </div>
              </div>
            )
          })()}
        </Modal>
      )}
    </div>
  )
}
