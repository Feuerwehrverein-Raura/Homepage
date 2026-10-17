import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Register service worker for PWA. Eine Kiosk-Kasse laedt die Seite nie neu
// und blieb so auf alten Fassungen (Chilbi 2026: Tischzahlung ohne Anmeldung).
// Deshalb alle 10 min nach einer neuen Fassung fragen - nur bei leerem
// Warenkorb, denn autoUpdate laedt die Seite gleich danach neu.
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  },
  onOfflineReady() {
    console.log('Order System ready for offline use');
  },
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    setInterval(() => {
      if (!(window as any).__kasseBeschaeftigt) reg.update().catch(() => {});
    }, 10 * 60 * 1000);
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
