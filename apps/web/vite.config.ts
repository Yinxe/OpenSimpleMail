import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // One .env at the repository root drives both processes: PORT for the API,
  // WEB_PORT for Vite, so the proxy can never drift from the server it targets.
  const envDir = fileURLToPath(new URL('../..', import.meta.url))
  const env = loadEnv(mode, envDir, '')
  const apiPort = env.PORT || '4000'
  const webPort = Number(env.WEB_PORT || 5173)

  // Allows a second Vite instance to target a test API without editing this file.
  const apiTarget = process.env.OSM_API_PROXY ?? `http://localhost:${apiPort}`

  return {
    plugins: [react()],
    envDir,
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
      port: webPort,
      // Fail loudly instead of moving to another port: WEB_ORIGIN on the API
      // must match the browser origin exactly.
      strictPort: true,
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
  }
})
