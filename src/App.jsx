import { useState, useRef } from 'react'
import { AuthProvider, useAuth } from './contexts/Auth'
import { SocieteProvider, useSociete } from './contexts/Societe'
import { Spinner } from './components/UI'
import Layout from './components/Layout'
import Login from './pages/Login'
import SelectSociete from './pages/SelectSociete'
import Apercu from './pages/Apercu'
import Patrimoine from './pages/Patrimoine'
import FinancesHub from './pages/FinancesHub'
import Analyse from './pages/Analyse'
import Pipeline from './pages/Pipeline'
import Outils from './pages/Outils'
import Parametres from './pages/Parametres'
import SmartUpload from './components/SmartUpload'

// New route names — Refonte « Clarté ».
// « Opportunités » (Refonte) est prévu comme Veille + Simulateur ; la page
// Pipeline existante en devient la vue Veille par défaut.
// Les anciennes clés (dashboard/finances/outils/pipeline) sont conservées
// comme alias pour ne pas casser les liens internes existants.
const PAGES = {
  apercu: Apercu,
  patrimoine: Patrimoine,
  flux: FinancesHub,
  analyse: Analyse,
  opportunites: Pipeline,
  parametres: Parametres,
  // Aliases (transitional)
  dashboard: Apercu,
  finances: FinancesHub,
  pipeline: Pipeline,
  outils: Outils,
}

function AppContent() {
  const { user, loading: authLoading } = useAuth()
  const [page, setPage] = useState('apercu')

  if (authLoading) return <Spinner />
  if (!user) return <Login />

  return (
    <SocieteProvider>
      <AppWithSociete page={page} setPage={setPage} />
    </SocieteProvider>
  )
}

function AppWithSociete({ page, setPage }) {
  const { selected, loadingData, loadingSocietes } = useSociete()
  const [navState, setNavState] = useState(null)
  const [smartUploadFile, setSmartUploadFile] = useState(null)

  const navigate = (p, state = null) => { setNavState(state); setPage(p) }

  // Track which pages have been visited so we mount them once and keep them alive
  const mounted = useRef(new Set(['apercu']))
  if (!mounted.current.has(page)) mounted.current.add(page)

  if (loadingSocietes) return <Spinner />
  if (!selected) return <SelectSociete />

  // Sidebar drop → open SmartUpload with the dropped file
  const handleDropFile = (file) => {
    setSmartUploadFile(file)
  }

  return (
    <Layout page={page} setPage={setPage} onDropFile={handleDropFile}>
      {loadingData ? <Spinner /> : (
        <>
          {Object.entries(PAGES).map(([key, PageComponent]) => {
            if (!mounted.current.has(key)) return null
            return (
              <div key={key} style={{ display: key === page ? 'block' : 'none' }}>
                <PageComponent navigate={navigate} navState={key === page ? navState : null} setNavState={setNavState} />
              </div>
            )
          })}
        </>
      )}
      {smartUploadFile && (
        <SmartUpload
          onClose={() => setSmartUploadFile(null)}
          initialFile={smartUploadFile}
        />
      )}
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
