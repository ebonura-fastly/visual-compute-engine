import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { BeaconProvider } from './BeaconProvider'

// Design tokens (CSS variables) - needed for our custom styling
import './styles/tokens.css'
// Configure Compute specific styles (nodes, layout)
import './styles/nodes.css'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BeaconProvider>
      <App />
    </BeaconProvider>
  </StrictMode>,
)
