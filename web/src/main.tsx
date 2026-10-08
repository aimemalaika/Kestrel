import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/tokens.css'
import { App } from './App'
import { SessionsProvider } from './sessions/SessionsProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionsProvider>
        <App />
      </SessionsProvider>
    </BrowserRouter>
  </StrictMode>,
)
