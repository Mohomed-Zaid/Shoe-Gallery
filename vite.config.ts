import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    includeAssets: ['favicon.svg','shoe_gallery.jpeg','icons/*.png'],
    manifest: {
      name: 'Shoe Gallery POS', short_name: 'Shoe Gallery',
      description: 'Shoe Shop Inventory and POS Management System',
      start_url: '/', scope: '/', display: 'standalone',
      theme_color: '#064e3b', background_color: '#061711',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,woff2,png,jpg,jpeg,svg,ico}'],
      navigateFallback: '/index.html',
      cleanupOutdatedCaches: true,
      navigateFallbackDenylist: [/^\/assets\//, /\.[^/]+$/],
      runtimeCaching: [
        { urlPattern: /^https:\/\/.*\.supabase\.co\//i, handler: 'NetworkOnly' },
        { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//i, handler: 'StaleWhileRevalidate', options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 } } },
      ],
    },
    devOptions: { enabled: true, type: 'module', navigateFallback: '/index.html' },
  })],
});
