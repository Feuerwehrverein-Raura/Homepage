import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'logo-192.png', 'logo-512.png'],
      manifest: {
        name: 'Bestellsystem - FWV Raura',
        short_name: 'Kasse',
        description: 'Bestell- und Kassensystem für den Feuerwehrverein Raura',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'fullscreen',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          {
            src: 'logo-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'logo-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        categories: ['business', 'utilities'],
        lang: 'de-CH'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/order\.fwv-raura\.ch\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              // Schwaches Netz im Schopf: nach 8 s den letzten Stand nehmen,
              // und der bleibt 12 h (Artikel auch nach Neuladen ohne Netz).
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 12
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://backend:3000',
        changeOrigin: true,
      },
    },
  },
});
