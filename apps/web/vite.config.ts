import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Allows a second Vite instance to target a test API without editing this file.
const apiTarget = process.env.OSM_API_PROXY ?? 'http://localhost:4000'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // The shared workspace package is emitted as CommonJS for the NestJS server.
    // Pre-bundling it gives the browser real named ESM exports.
    include: ['@osm/shared'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
