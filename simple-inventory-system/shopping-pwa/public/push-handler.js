// Push-Handler für die Einkaufs-PWA. Wird vom generierten Service-Worker via
// workbox.importScripts eingebunden (kein eigener SW-Aufbau nötig).

self.addEventListener('push', (event) => {
  let data = { title: 'Einkauf · FWV Raura', body: '', url: '/' }
  try { if (event.data) data = Object.assign(data, event.data.json()) } catch (e) { /* ignore */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo-192.png',
      badge: '/logo-192.png',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { try { c.navigate(url) } catch (e) { /* */ } return c.focus() }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
