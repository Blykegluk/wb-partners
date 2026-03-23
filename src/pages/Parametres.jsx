import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useSociete } from '../contexts/Societe'
import { PageHeader, Card, Field, Grid2, Btn } from '../components/UI'
import { CheckCircle } from 'lucide-react'

export default function Parametres() {
  const { selected, isAdmin, reload } = useSociete()
  const [f, setF] = useState({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (selected) setF({ ...selected })
  }, [selected])

  const u = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    const { id, _role, created_at, owner_id, ...data } = f
    await supabase.from('societe').update(data).eq('id', selected.id)
    reload()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <PageHeader title="Paramètres" sub="Informations de la société">
        {isAdmin && (
          <Btn onClick={save}>
            {saved ? <><CheckCircle size={15} /> Enregistré</> : 'Enregistrer'}
          </Btn>
        )}
      </PageHeader>

      <Card className="p-6">
        <h3 className="text-sm font-bold text-navy mb-4">Identité</h3>
        <Grid2>
          <Field label="Nom légal *" value={f.nom || ''} onChange={e => u('nom', e.target.value)} disabled={!isAdmin} />
          <Field label="Nom d'affichage" value={f.nom_affiche || ''} onChange={e => u('nom_affiche', e.target.value)} disabled={!isAdmin} />
        </Grid2>
        <Grid2>
          <Field label="SIRET" value={f.siret || ''} onChange={e => u('siret', e.target.value)} disabled={!isAdmin} />
          <Field label="RCS" value={f.rcs || ''} onChange={e => u('rcs', e.target.value)} disabled={!isAdmin} />
        </Grid2>
        <Grid2>
          <Field label="APE" value={f.ape || ''} onChange={e => u('ape', e.target.value)} disabled={!isAdmin} />
          <Field label="TVA Intracommunautaire" value={f.tva_intracommunautaire || ''} onChange={e => u('tva_intracommunautaire', e.target.value)} disabled={!isAdmin} />
        </Grid2>
        <Field label="Capital" value={f.capital || ''} onChange={e => u('capital', e.target.value)} disabled={!isAdmin} />

        <h3 className="text-sm font-bold text-navy mb-4 mt-8">Contact</h3>
        <Field label="Adresse" value={f.adresse || ''} onChange={e => u('adresse', e.target.value)} disabled={!isAdmin} />
        <Grid2>
          <Field label="Code postal" value={f.code_postal || ''} onChange={e => u('code_postal', e.target.value)} disabled={!isAdmin} />
          <Field label="Ville" value={f.ville || ''} onChange={e => u('ville', e.target.value)} disabled={!isAdmin} />
        </Grid2>
        <Grid2>
          <Field label="Téléphone" value={f.telephone || ''} onChange={e => u('telephone', e.target.value)} disabled={!isAdmin} />
          <Field label="Email" type="email" value={f.email || ''} onChange={e => u('email', e.target.value)} disabled={!isAdmin} />
        </Grid2>

        <h3 className="text-sm font-bold text-navy mb-4 mt-8">Coordonnées bancaires</h3>
        <Field label="IBAN" value={f.iban || ''} onChange={e => u('iban', e.target.value)} disabled={!isAdmin} />
        <Grid2>
          <Field label="BIC" value={f.bic || ''} onChange={e => u('bic', e.target.value)} disabled={!isAdmin} />
          <Field label="Nom de la banque" value={f.nom_banque || ''} onChange={e => u('nom_banque', e.target.value)} disabled={!isAdmin} />
        </Grid2>
        <Field label="Adresse de la banque" value={f.adresse_banque || ''} onChange={e => u('adresse_banque', e.target.value)} disabled={!isAdmin} />
      </Card>
    </div>
  )
}
