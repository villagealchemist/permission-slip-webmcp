import { createRoot } from 'react-dom/client'
import { ContractExplorer } from './contract-explorer/ContractExplorer'
import './contract-explorer/contract-explorer.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found.')
}

createRoot(rootElement).render(<ContractExplorer />)
