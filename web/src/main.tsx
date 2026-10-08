import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/tokens.css'
import { App } from './App'
import { ToastProvider } from './toast/ToastProvider'
import { SessionsProvider } from './sessions/SessionsProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionsProvider>
          <App />
        </SessionsProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
