import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Register PWA service worker
registerSW({
  onNeedRefresh() {
    // Auto-update without prompting
    window.location.reload();
  },
  onOfflineReady() {
    console.log('Kitchen Display ready for offline use');
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
