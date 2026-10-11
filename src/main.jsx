import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/installPrompt' // จับ beforeinstallprompt ก่อน React render (ยิงตั้งแต่โหลดหน้า)
import AppRoot from './AppRoot.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
)
