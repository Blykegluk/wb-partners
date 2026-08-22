import { useState } from 'react'
import { FileSearch, ChevronLeft, Maximize2, Calendar } from 'lucide-react'
import { Card, Empty, PageHeader } from '../components/UI'
import buildupBio from '../etudes/2026-08-buildup-bio.html?raw'

// Bibliothèque des études de développement — analyses de fond menées pour
// éclairer une décision de croissance (nouveau marché, cible d'acquisition,
// stratégie d'enseigne). Chaque étude est un document HTML autonome versionné
// dans src/etudes/ ; ajouter une étude = déposer le fichier et ajouter une
// entrée ici.
const ETUDES = [
  {
    id: 'buildup-bio-2026-08',
    titre: 'Bâtir un réseau bio par acquisitions',
    date: '2026-08-22',
    resume: "Ce que Marcel & Fils a fait à 160 M€, appliqué à l'échelle de WB Partners : "
      + "le marché bio 2025 qui repart, la séquence d'acquisitions documentée, une pyramide "
      + 'de cibles réelles à trois rangs et une feuille de route à 90 jours.',
    chiffres: [
      { v: '6 431', l: 'magasins bio cartographiés' },
      { v: '21', l: 'réseaux de 3 magasins et +' },
      { v: '15', l: 'cibles versées en base' },
    ],
    tags: ['Bio', 'Croissance externe', 'France entière'],
    html: buildupBio,
  },
]

const fmtDateLongue = (iso) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

// L'étude est un document complet avec sa propre feuille de style : on l'isole
// dans un cadre pour qu'elle ne collisionne pas avec celle de l'application, et
// on la force en thème clair (le dashboard n'a pas de thème sombre).
//
// Le fichier source est écrit pour être publié tel quel (titre, polices et
// styles en tête, contenu dans <main>). Ici il faut reconstruire un document
// complet, et la découpe compte : laisser <title>/<link>/<style> dans le <body>
// fait S'ARRÊTER l'analyseur HTML juste après le <link> — le cadre reste vide.
// On rend donc à la tête ce qui lui appartient.
const documentComplet = (html) => {
  const i = html.indexOf('<main>')
  // Les polices distantes sont chargées sans bloquer le premier rendu : une
  // feuille de style tierce en attente laisserait le cadre vide tant qu'elle
  // n'a pas répondu. Le texte s'affiche donc tout de suite dans les polices de
  // repli, et bascule sur les polices de l'étude dès qu'elles arrivent.
  const tete = (i > 0 ? html.slice(0, i) : '')
    .replace(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com[^"]*)">/,
      '<link rel="stylesheet" href="$1" media="print" onload="this.media=\'all\'">')
  const corps = i > 0 ? html.slice(i) : html
  return '<!doctype html><html lang="fr" data-theme="light"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + tete + '</head><body>' + corps + '</body></html>'
}

function Lecteur({ etude, onRetour }) {
  const ouvrirPleinEcran = () => {
    const blob = new Blob([documentComplet(etude.html)], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    // L'onglet a le temps de charger avant la libération de l'URL.
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <button onClick={onRetour}
          className="text-blue-600 hover:text-blue-800 text-xs font-semibold cursor-pointer inline-flex items-center gap-1">
          <ChevronLeft size={13} />Toutes les études
        </button>
        <button onClick={ouvrirPleinEcran}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 bg-white text-gray-500 border border-gray-200 hover:bg-gray-50">
          <Maximize2 size={13} />Ouvrir en plein écran
        </button>
      </div>
      <Card className="overflow-hidden p-0">
        <iframe
          title={etude.titre}
          srcDoc={documentComplet(etude.html)}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          style={{ width: '100%', height: 'clamp(520px, calc(100vh - 240px), 1100px)', border: 0, display: 'block' }}
        />
      </Card>
    </div>
  )
}

export default function EtudesDeveloppement() {
  const [ouverte, setOuverte] = useState(null)

  if (ouverte) {
    return (
      <div>
        <PageHeader title={ouverte.titre} sub={`Étude du ${fmtDateLongue(ouverte.date)}`} />
        <Lecteur etude={ouverte} onRetour={() => setOuverte(null)} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Études développement"
        sub="Les analyses de fond qui éclairent les décisions de croissance — marché, cibles, chiffrage" />

      {ETUDES.length === 0 ? (
        <Empty icon={<FileSearch size={40} />} text="Aucune étude pour le moment." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {ETUDES.map(e => (
            <Card key={e.id} className="p-5 cursor-pointer hover:shadow-md transition-shadow flex flex-col gap-3"
              onClick={() => setOuverte(e)}>
              <div>
                <p className="text-gray-400 text-[11px] uppercase tracking-wide font-bold flex items-center gap-1.5 m-0">
                  <Calendar size={11} />{fmtDateLongue(e.date)}
                </p>
                <h3 className="text-navy font-bold text-lg mt-1 mb-0">{e.titre}</h3>
              </div>
              <p className="text-gray-600 text-sm m-0">{e.resume}</p>

              <div className="flex gap-6 flex-wrap border-t border-gray-100 pt-3">
                {e.chiffres.map(c => (
                  <div key={c.l}>
                    <p className="text-navy font-extrabold text-lg m-0">{c.v}</p>
                    <p className="text-gray-400 text-[11px] m-0">{c.l}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-1.5 flex-wrap mt-auto">
                {e.tags.map(t => (
                  <span key={t} className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[11px] font-semibold">{t}</span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="text-gray-300 text-[11px] text-center mt-10 max-w-xl mx-auto">
        Analyses structurées d'aide à la décision, sur données publiques citées dans chaque étude.
        Ne constitue pas un conseil juridique, fiscal ou en investissement.
      </p>
    </div>
  )
}
