import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10)
const pwaRequested = process.env.ENABLE_PWA !== 'false'
const pwaSupportedRuntime = Number.isFinite(nodeMajor) && nodeMajor >= 18 && nodeMajor < 23
const enablePwa = pwaRequested && pwaSupportedRuntime

if (pwaRequested && !pwaSupportedRuntime) {
  console.warn(
    `[vite] PWA plugin disabled on Node ${process.versions.node}. ` +
    'Use Node 20/22 LTS or set ENABLE_PWA=true after validating compatibility.'
  )
}

const plugins = [
  react(),
]

if (enablePwa) {
  plugins.push(
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
            }
          }
        ]
      },
      manifest: {
        name: 'Speed Reader',
        short_name: 'SpeedRead',
        description: 'Master the art of rapid reading.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  )
}

// https://vite.dev/config/
export default defineConfig({
  plugins,
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          epub: ['epubjs', 'jszip'],
          ui: ['react-hot-toast']
        }
      }
    }
  }
})
