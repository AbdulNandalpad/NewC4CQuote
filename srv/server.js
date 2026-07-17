import cds from '@sap/cds'
import cors from 'cors'

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

cds.on('bootstrap', (app) => {
  app.use(
    cors({
      origin: allowedOrigins,
    }),
  )
})
