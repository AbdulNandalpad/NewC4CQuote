import cds from '@sap/cds'
import cors from 'cors'

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

// Lightweight interim lock on PricingService: a single hardcoded account,
// HTTP Basic Auth, no XSUAA/@sap/xssec involved (that's parked for the
// upcoming OBO/authorization phase — see README "Open items"). The
// password is NOT committed here; set it via `cf set-env NewC4CQuote-srv
// PRICING_ADMIN_PASSWORD '...'` (then restage). If it's unset, this
// account simply cannot log in — fails closed, not open.
const PRICING_ADMIN_EMAIL = process.env.PRICING_ADMIN_EMAIL || 'abdul.nandalpad@trelleborg.com'
const PRICING_ADMIN_PASSWORD = process.env.PRICING_ADMIN_PASSWORD

cds.env.requires.auth = {
  kind: 'basic',
  users: {
    [PRICING_ADMIN_EMAIL]: { password: PRICING_ADMIN_PASSWORD ?? Math.random().toString(36) },
  },
}
if (!PRICING_ADMIN_PASSWORD) {
  console.warn(
    `[auth] PRICING_ADMIN_PASSWORD is not set — ${PRICING_ADMIN_EMAIL} cannot log in until it is (a random unknown password is used as a placeholder, so this fails closed).`,
  )
}

cds.on('bootstrap', (app) => {
  app.use(
    cors({
      origin: allowedOrigins,
    }),
  )
})
