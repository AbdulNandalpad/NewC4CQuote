import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

// This app is meant to be iframed by SAP C4C as a URL Mashup. Browsers block
// framing by default unless the framed page explicitly allows the parent's
// origin via CSP frame-ancestors (X-Frame-Options is ignored once CSP is
// present). Configure the real C4C tenant domain(s) via FRAME_ANCESTORS,
// comma-separated, before deploying — the default only allows same-origin.
const frameAncestors = (process.env.FRAME_ANCESTORS || "'self'")
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .join(' ')

app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors}`)
  next()
})

app.get('/runtime-config.js', (_req, res) => {
  res.type('application/javascript')
  res.send(`window.__CONFIG__ = ${JSON.stringify({ apiOrigin: process.env.API_ORIGIN || '' })}`)
})

app.use(express.static(path.join(dirname, 'dist')))
app.use((_req, res) => {
  res.sendFile(path.join(dirname, 'dist', 'index.html'))
})

const port = process.env.PORT || 8082
app.listen(port, () => console.log(`quote-items listening on ${port}`))
