import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

// Service Worker für PWA (Auto-Update + Offline-Fähigkeit)
registerSW({
  onNeedRefresh() {
    window.location.reload()
  },
  onOfflineReady() {
    console.log('Einkauf-PWA offline bereit')
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
