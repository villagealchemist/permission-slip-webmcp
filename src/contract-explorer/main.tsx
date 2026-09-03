import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ContractExplorer } from './ContractExplorer'
import './contract-explorer.css'

createRoot(document.getElementById('contract-root')!).render(
  <StrictMode>
    <ContractExplorer />
  </StrictMode>,
)
