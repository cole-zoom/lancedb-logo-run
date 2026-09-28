import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleFeedback } from './api/_slack'

// In dev, serve /api/feedback the same way the Vercel function does in production.
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/feedback', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let raw = ''
        req.on('data', (c) => (raw += c))
        req.on('end', async () => {
          let body: unknown
          try {
            body = JSON.parse(raw)
          } catch {
            body = null
          }
          const { status, json } = await handleFeedback(body, env)
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(json))
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(loadEnv(mode, process.cwd(), ''))],
  build: { chunkSizeWarningLimit: 1600 },
}))
