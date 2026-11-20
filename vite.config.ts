/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'


// Hébergement dans un sous-dossier (GitHub Pages) : VITE_BASE=/LEVEL/ ; en local : racine
const base = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITE_BASE ?? '/'

export default defineConfig({
  base,
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Level',
        short_name: 'Level',
        description: 'Progression personnelle LIFE · SPORT · RPG, hors ligne.',
        theme_color: '#0B0D11',
        background_color: '#0B0D11',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,woff}'], importScripts: ['sw-notify.js'] },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
