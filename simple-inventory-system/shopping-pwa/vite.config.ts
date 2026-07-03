import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'logo-192.png', 'logo-512.png'],
      manifest: {
        name: 'Einkauf - FWV Raura',
        short_name: 'Einkauf',
        description: 'Einkaufslisten für Vereins-Events — offline abhaken, live geteilt',
        theme_color: '#16a34a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          { src: 'logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        categories: ['shopping', 'productivity', 'utilities'],
        lang: 'de-CH'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Push-/Notification-Handler in den generierten SW einbinden
        importScripts: ['/push-handler.js'],
        runtimeCaching: [
          {
            // Einkaufslisten offline verfügbar halten (zuletzt geladener Stand).
            urlPattern: /^https:\/\/inventar\.fwv-raura\.ch\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'einkauf-api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 8083,
  },
})
