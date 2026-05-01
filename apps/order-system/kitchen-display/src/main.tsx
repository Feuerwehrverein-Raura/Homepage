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

// Keep screen awake using Wake Lock API
let wakeLock: WakeLockSentinel | null = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock active - screen will stay on');
    }
  } catch (err) {
    console.log('Wake Lock not available:', err);
  }
}

// Re-request wake lock when tab becomes visible again
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && !wakeLock) {
    await requestWakeLock();
  }
});

// Request wake lock on load
requestWakeLock();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
