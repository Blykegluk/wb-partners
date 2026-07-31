import { createRoot } from 'react-dom/client'
import FinancesHub from '../src/pages/FinancesHub.jsx'
import ParametresPage from '../src/pages/Parametres.jsx'
import Apercu from '../src/pages/Apercu.jsx'
import Analyse from '../src/pages/Analyse.jsx'
import Opportunites from '../src/pages/Opportunites.jsx'
import './harness.css'
function App() {
  const page = new URLSearchParams(location.search).get('page') || 'flux'
  const props = { navigate: () => {}, navState: null, setNavState: () => {} }
  if (page === 'parametres') return <ParametresPage {...props} />
  if (page === 'apercu') return <Apercu {...props} />
  if (page === 'analyse') return <Analyse {...props} />
  if (page === 'opportunites') return <Opportunites {...props} />
  return <FinancesHub {...props} />
}
createRoot(document.getElementById('root')).render(<App />)
