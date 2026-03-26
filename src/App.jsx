import { useState, useRef } from 'react'
import { AuthProvider, useAuth } from './contexts/Auth'
import { SocieteProvider, useSociete } from './contexts/Societe'
import { Spinner } from './components/UI'
import Layout from './components/Layout'
import Login from './pages/Login'
import SelectSociete from './pages/SelectSociete'
import Dashboard from './pages/Dashboard'
import Biens from './pages/Biens'
import Locataires from './pages/Locataires'
import Baux from './pages/Baux'
import Finances from './pages/Finances'
import Transactions from './pages/Transactions'
import Documents from './pages/Documents'
import Parametres from './pages/Parametres'
import Membres from './pages/Membres'
import Simulateur from './pages/Simulateur'
import Fiscal from './pages/Fiscal'
import Tresorerie from './pages/Tresorerie'
import Revisions from './pages/Revisions'
import Relances from './pages/Relances'
import Carte from './pages/Carte'

const PAGES = {
  dashboard: Dashboard,
  biens: Biens,
  locataires: Locataires,
  baux: Baux,
  finances: Finances,
  transactions: Transactions,
  documents: Documents,
  parametres: Parametres,
  membres: Membres,
  simulateur: Simulateur,
  fiscal: Fiscal,
  tresorerie: Tresorerie,
  revisions: Revisions,
  relances: Relances,
  carte: Carte,
}

function AppContent() {
  const { user, loading: authLoading } = useAuth()
  const [page, setPage] = useState('dashboard')

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

  const navigate = (p, state = null) => { setNavState(state); setPage(p) }

  // Track which pages have been visited so we mount them once and keep them alive
  const mounted = useRef(new Set(['dashboard']))
  if (!mounted.current.has(page)) mounted.current.add(page)

  if (loadingSocietes) return <Spinner />
  if (!selected) return <SelectSociete />

  return (
    <Layout page={page} setPage={setPage}>
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
