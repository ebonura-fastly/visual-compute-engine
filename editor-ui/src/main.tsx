import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Design tokens and component styles
import './styles/tokens.css'
import './styles/components.css'
import './styles/nodes.css'
import './index.css'

// Initialize theme before React renders to prevent flash
import { initializeTheme } from './styles/theme'
initializeTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
