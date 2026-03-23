import { useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useSociete } from '../contexts/Societe'
import { fmt, fmtPct } from '../lib/utils'
import { rendementBrut, cashflowMensuel } from '../lib/calculs'
import { PageHeader, Card, Empty } from '../components/UI'
import { Map as MapIcon } from 'lucide-react'

const getColor = (bien) => {
  const rdt = rendementBrut(bien)
  if (rdt === null) return '#94a3b8'
  if (rdt >= 0.08) return '#22c55e'
  if (rdt >= 0.05) return '#f59e0b'
  return '#ef4444'
}

export default function Carte() {
  const { biens, baux, locataires } = useSociete()

  const biensGeo = useMemo(() =>
    biens.filter(b => b.latitude && b.longitude),
    [biens]
  )

  const center = useMemo(() => {
    if (biensGeo.length === 0) return [46.603354, 1.888334]
    const lat = biensGeo.reduce((s, b) => s + b.latitude, 0) / biensGeo.length
    const lng = biensGeo.reduce((s, b) => s + b.longitude, 0) / biensGeo.length
    return [lat, lng]
  }, [biensGeo])

  const zoom = biensGeo.length === 0 ? 6 : biensGeo.length === 1 ? 14 : 6

  const sansCoords = biens.filter(b => !b.latitude || !b.longitude).length

  return (
    <div>
      <PageHeader title="Carte du patrimoine" sub={`${biensGeo.length} bien${biensGeo.length > 1 ? 's' : ''} géolocalisé${biensGeo.length > 1 ? 's' : ''}`} />

      {sansCoords > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-xs text-yellow-700">
          {sansCoords} bien{sansCoords > 1 ? 's' : ''} sans coordonnées GPS. Éditez-les et utilisez l'autocomplétion d'adresse pour les géolocaliser.
        </div>
      )}

      {biensGeo.length === 0 ? (
        <Empty icon={<MapIcon size={40} />} text="Aucun bien géolocalisé. Ajoutez des biens avec une adresse." />
      ) : (
        <Card className="overflow-hidden" style={{ height: 'calc(100vh - 240px)' }}>
          <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {biensGeo.map(b => {
              const bail = baux.find(ba => ba.bien_id === b.id && ba.actif)
              const loc = bail ? locataires.find(l => l.id === bail.locataire_id) : null
              const rdt = rendementBrut(b)
              const cf = cashflowMensuel(b)
              return (
                <CircleMarker
                  key={b.id}
                  center={[b.latitude, b.longitude]}
                  radius={10}
                  pathOptions={{ color: getColor(b), fillColor: getColor(b), fillOpacity: 0.8, weight: 2 }}
                >
                  <Popup>
                    <div className="text-xs leading-relaxed min-w-[200px]">
                      <p className="font-bold text-sm">{b.reference || b.adresse}</p>
                      <p className="text-gray-500">{b.adresse}, {b.code_postal} {b.ville}</p>
                      <hr className="my-1.5" />
                      <p>Loyer : <strong>{fmt(b.loyer_mensuel)}/mois</strong></p>
                      {rdt !== null && <p>Rendement brut : <strong>{fmtPct(rdt)}</strong></p>}
                      <p>Cashflow : <strong className={cf >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(cf)}/mois</strong></p>
                      {loc && <p className="mt-1">Locataire : {loc.raison_sociale || `${loc.prenom} ${loc.nom}`}</p>}
                      {!bail && <p className="mt-1 text-orange-600 font-semibold">Vacant</p>}
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>
        </Card>
      )}

      {/* Legend */}
      <div className="flex gap-6 mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500" /> &gt; 8% rendement</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-500" /> 5-8%</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500" /> &lt; 5%</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-400" /> Non calculable</span>
      </div>
    </div>
  )
}
