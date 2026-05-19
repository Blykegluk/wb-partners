import { useState } from 'react'
import { FileText, Printer, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/Auth'
import { useSociete } from '../contexts/Societe'
import { pdfFichePatrimoniale } from '../lib/pdf'
import { Card, Btn } from '../components/UI'

export default function FichePatrimoniale() {
  const { user } = useAuth()
  const { societes } = useSociete()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    if (societes.length === 0) {
      setError('Aucune société accessible.')
      return
    }
    setError('')
    setLoading(true)

    try {
      // Fetch biens, actionnaires, baux for every accessible société in parallel.
      const data = await Promise.all(
        societes.map(async (soc) => {
          const [biens, actionnaires, baux] = await Promise.all([
            supabase.from('biens').select('*').eq('societe_id', soc.id).order('created_at'),
            supabase.from('actionnaires').select('*').eq('societe_id', soc.id).order('pourcentage', { ascending: false }),
            supabase.from('baux').select('*').eq('societe_id', soc.id),
          ])
          return {
            societe: soc,
            biens: biens.data || [],
            actionnaires: actionnaires.data || [],
            baux: baux.data || [],
          }
        })
      )

      const userName = user?.user_metadata?.full_name || user?.email || ''
      pdfFichePatrimoniale({ userName, societes: data })
    } catch (e) {
      setError(e.message || 'Erreur lors de la génération.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-8">
      <div className="text-center max-w-xl mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-navy/5 flex items-center justify-center mx-auto mb-4">
          <FileText size={28} className="text-navy" />
        </div>
        <h2 className="text-lg font-bold text-navy mb-2">Fiche patrimoniale consolidée</h2>
        <p className="text-sm text-gray-500 mb-6">
          Génère un PDF récapitulatif à jour de toutes les sociétés auxquelles vous avez accès :
          identité juridique, actionnariat, biens enregistrés, encours d'emprunt,
          loyers, cashflow et patrimoine net — avec quote-part calculée pour chaque actionnaire.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6 text-left">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-navy">{societes.length}</p>
            <p className="text-xs text-gray-400 uppercase font-semibold mt-1">Sociétés</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-navy">multi</p>
            <p className="text-xs text-gray-400 uppercase font-semibold mt-1">Biens consolidés</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-navy">PDF</p>
            <p className="text-xs text-gray-400 uppercase font-semibold mt-1">À jour ce jour</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-500 text-sm mb-4 justify-center">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        <Btn onClick={generate} disabled={loading || societes.length === 0} className="justify-center">
          <Printer size={15} />
          {loading ? 'Génération...' : 'Générer la fiche patrimoniale'}
        </Btn>

        <p className="text-xs text-gray-300 mt-4">
          Le document s'ouvre dans un nouvel onglet avec la boîte de dialogue d'impression prête.
          Vous pouvez l'imprimer ou choisir « Enregistrer au format PDF ».
        </p>
      </div>
    </Card>
  )
}
