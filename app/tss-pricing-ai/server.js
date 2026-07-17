import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

// Baked into the page before the app bundle runs, so the deployed backend
// URL can be set per-environment via CF env var without rebuilding.
app.get('/runtime-config.js', (_req, res) => {
  res.type('application/javascript')
  res.send(
    `window.__CONFIG__ = ${JSON.stringify({
      apiOrigin: process.env.API_ORIGIN || '',
      adminEmail: process.env.PRICING_ADMIN_EMAIL || '',
    })}`,
  )
})

app.use(express.static(path.join(dirname, 'dist')))
app.use((_req, res) => {
  res.sendFile(path.join(dirname, 'dist', 'index.html'))
})

const port = process.env.PORT || 8081
app.listen(port, () => console.log(`pricing-simulation listening on ${port}`))
