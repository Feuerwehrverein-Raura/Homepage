// Service Worker fuer Web-Push der Mitglieder-App im Browser (mein.html).
// Registriert von lib/push/web_push_web.dart mit Bereich /mein/. Inhalt vom
// Backend (docker/backend-members/src/push-versand.js): { titel, text, daten }.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (_) {
    d = { titel: 'FWV Raura', text: e.data ? e.data.text() : '' };
  }
  const titel = d.titel || 'FWV Raura';
  const text = d.text || '';
  e.waitUntil(self.registration.showNotification(titel, {
    body: text,
    icon: '/mein/icons/Icon-192.png',
    badge: '/mein/icons/Icon-192.png',
    // Wie bei FCM: Titel und Text mit, damit die App sie ohne Ziel zeigt.
    data: Object.assign({}, d.daten || {}, { title: titel, body: text }),
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const daten = e.notification.data || {};
  e.waitUntil((async () => {
    const fenster = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = fenster.find((f) => {
      const pfad = new URL(f.url).pathname;
      return pfad === '/mein.html' || pfad.startsWith('/mein/');
    });
    if (app) {
      await app.focus();
      app.postMessage({ typ: 'fwv-push-angetippt', daten });
      return;
    }
    await self.clients.openWindow('/mein.html?push=' + encodeURIComponent(JSON.stringify(daten)));
  })());
});
