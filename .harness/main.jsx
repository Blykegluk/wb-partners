import { createRoot } from 'react-dom/client'
import FinancesHub from '../src/pages/FinancesHub.jsx'
import ParametresPage from '../src/pages/Parametres.jsx'
import './harness.css'
function App() {
  const page = new URLSearchParams(location.search).get('page') || 'flux'
  return page === 'parametres'
    ? <ParametresPage navState={null} setNavState={() => {}} />
    : <FinancesHub navigate={() => {}} navState={null} setNavState={() => {}} />
}
createRoot(document.getElementById('root')).render(<App />)
