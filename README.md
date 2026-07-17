# NewC4CQuote

A full-stack app on SAP BTP (Cloud Foundry) with two parts:

1. **Pricing simulation** (`app/pricing-simulation`) — a standalone scratchpad
   for pricing hypothetical line items.
2. **Quote items** (`app/quote-items`) — a replica of the C4C Quote's item
   tab. This is the part meant to be **embedded back into SAP C4C** as a
   URL Mashup (see below). Advanced features here (including the "AI
   replacement" behavior) are intentionally not yet built — scope is being
   defined as we go.

Both talk to a shared SAP CAP (Node.js) backend (`srv/`) exposing two OData
services: `/pricing` and `/quote-items`.

## Architecture

```
srv/                CAP backend (Node.js) — OData services, SQLite for now
  pricing-service.cds
  quote-items-service.cds
db/schema.cds        Data model for both services
app/pricing-simulation/   React (Vite) UI + a tiny Express static server
app/quote-items/          React (Vite) UI + a tiny Express static server
mta.yaml              Cloud Foundry MTA: 3 modules (srv, pricing-simulation, quote-items)
```

Each UI app is deployed as its **own** Cloud Foundry app (not bundled behind
an approuter / HTML5 App Repository). Reasoning: an approuter+XSUAA gateway
forces an interactive login redirect, which breaks an app that's meant to be
silently iframed inside a C4C mashup. Instead:

- The CAP backend allows cross-origin requests from both UI origins (CORS,
  see `srv/server.js`, configured via the `ALLOWED_ORIGINS` env var).
- Each UI is served by a minimal Express server (`server.js`) instead of a
  static buildpack, so we have full control over response headers and can
  inject the backend's URL at **runtime** (via `/runtime-config.js`, reading
  an `API_ORIGIN` env var) rather than baking it in at build time — CF only
  assigns routes at push time, so build-time env vars don't work here.
- `app/quote-items/server.js` additionally sets
  `Content-Security-Policy: frame-ancestors <FRAME_ANCESTORS>` on every
  response, which is what allows C4C to iframe it at all (see below).

No authentication is enforced yet anywhere — see "Open items".

## Local development

Terminal 1 — backend:
```
npm install
npm start                      # cds-serve on http://localhost:4004
```

Terminal 2 — pricing simulation UI:
```
cd app/pricing-simulation
npm install
npm run dev                    # http://localhost:5173, proxies /pricing to :4004
```

Terminal 3 — quote items UI:
```
cd app/quote-items
npm install
npm run dev                    # http://localhost:5174, proxies /quote-items to :4004
```

To simulate C4C passing quote context into the mashup, open:
`http://localhost:5174/?quoteId=Q-100`

## Deploying to Cloud Foundry (SAP BTP)

Requires the [Cloud MTA Build Tool](https://sap.github.io/cloud-mta-build-tool/)
(`mbt`) and the Cloud Foundry CLI, both logged into your BTP subaccount.

```
npm install -g mbt
mbt build
cf deploy mta_archives/NewC4CQuote_1.0.0.mtar
```

Before deploying to a real C4C tenant, edit `mta.yaml`:
- `quote-items` module `properties.FRAME_ANCESTORS` — set to the real C4C
  tenant domain(s), e.g. `"https://my1234567.crm.ondemand.com"`. It
  defaults to `'self'` (same-origin only), which means an unconfigured
  deploy **fails closed** — C4C won't be able to frame it until this is set.
- Persistence: the backend currently runs on in-memory/file SQLite, fine for
  this proof-of-concept but not for real data. Swap in `cds add hana` or
  `cds add postgres` once that decision is made.

## Embedding `quote-items` in SAP C4C as a Mashup

C4C supports embedding an external web page into a screen via a **URL
Mashup**, rendered in an iframe with optional parameter binding to the
screen's business object fields.

1. **Business Configuration → Mashup Authoring** (or the "Mashups" work
   center view): create a new **URL Mashup**.
   - URL: your deployed `quote-items` app URL, e.g.
     `https://quote-items.cfapps.<region>.hana.ondemand.com/`
   - Add a mashup parameter, e.g. `quoteId`, and map it into the URL as a
     query parameter: `?quoteId={quoteId}`.
2. In the mashup's parameter binding, bind `quoteId` to the Quote screen's
   context field (e.g. the Quote's UUID/ID, via the standard C4C mashup
   parameter binding UI).
3. Open the Sales Quote screen in the **UI Designer** ("Adapt" mode), and
   add the mashup as a new embedded component / tab on the Items section,
   selecting the mashup created above.
4. Save and activate. The tab will load `quote-items` in an iframe with
   `quoteId` in the URL — exactly what `app/quote-items/src/App.jsx` already
   reads (`useQuoteIdFromUrl`) to filter which items it shows.

**Requirements this depends on (already handled in this scaffold):**
- HTTPS with a valid certificate (CF routes provide this by default).
- The framed page must not be blocked by `X-Frame-Options` and must allow
  the C4C domain via `Content-Security-Policy: frame-ancestors` — see
  `FRAME_ANCESTORS` above.
- Third-party cookie restrictions mean iframe-based login sessions are
  fragile — this is why auth for this app is deliberately still open (see
  below) rather than assumed to be interactive XSUAA login.

## Open items (to define as we proceed)

- **Auth strategy** for the embedded mashup (can't be an interactive login
  redirect inside a small iframe tab) — options include a signed token
  passed as a mashup parameter, IP/network restriction, or a service-to-
  service trust between C4C and this app.
- **Real C4C data integration**: today `QuoteItems` is our own copy, keyed
  by `c4cQuoteId`/`c4cItemId`. Reading/writing the actual C4C quote will
  need a Communication Arrangement + OData API call from `srv/`.
- **Persistence**: SQLite → HANA Cloud or PostgreSQL hyperscaler option.
- **The "AI replacement" feature itself** — not yet specified.
- **Pricing engine** — see [`docs/pricing-engine-spec.md`](docs/pricing-engine-spec.md)
  for the real (Trelleborg-specific) regional pricing formulas and the
  integration requirements: ERP + BI Central Cost DB via the API6
  middleware, and pulling data from a C4C Opportunity when it's converted
  to a Quote. This is meant to become the real pricing/quoting logic, not
  just the `app/pricing-simulation` sandbox — not yet implemented.
- **Priority** between building out Part 1 (pricing simulation) vs. Part 2
  (quote items + AI replacement) — TBD.
