# NewC4CQuote

A full-stack app on SAP BTP (Cloud Foundry) with two parts:

1. **TSS Pricing AI** (`app/tss-pricing-ai`) — a standalone scratchpad
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
app/tss-pricing-ai/   React (Vite) UI + a tiny Express static server
app/quote-items/          React (Vite) UI + a tiny Express static server
app/mcp-server/       MCP server (external agent access to PricingService)
mta.yaml              Cloud Foundry MTA: 4 modules (srv, tss-pricing-ai, quote-items, pricing-mcp-server)
```

Each UI app is deployed as its **own** Cloud Foundry app, reached directly —
no approuter in front of either one right now. Instead:
- The CAP backend allows cross-origin requests from both UI origins (CORS,
  see `srv/server.js`, configured via the `ALLOWED_ORIGINS` env var). In
  `mta.yaml` this is wired automatically — `NewC4CQuote-srv` picks up both
  UI apps' deployed URLs via `tss-pricing-ai-ui`/`quote-items-ui`
  bindings, so it doesn't need manual `cf set-env` after every deploy. If
  that circular module binding ever fails to deploy, fall back to setting
  `ALLOWED_ORIGINS` by hand: `cf set-env NewC4CQuote-srv ALLOWED_ORIGINS
  "https://<tss-pricing-ai-url>,https://<quote-items-url>"` + restage.
- Each UI is served by a minimal Express server (`server.js`) instead of a
  static buildpack, so we have full control over response headers and can
  inject the backend's URL at **runtime** (via `/runtime-config.js`, reading
  an `API_ORIGIN` env var) rather than baking it in at build time — CF only
  assigns routes at push time, so build-time env vars don't work here.
- `app/quote-items/server.js` additionally sets
  `Content-Security-Policy: frame-ancestors <FRAME_ANCESTORS>` on every
  response, which is what allows C4C to iframe it at all (see below).

## Access control

**Important CAP gotcha, if you add a new service:** once *any* real auth
strategy is configured (we use `kind: 'basic'`) and `NODE_ENV=production`
(which CF always sets), CAP defaults **every service without an explicit
`@requires`/`@restrict` to requiring `authenticated-user`** —
`srv/protocols/http.js`'s `authorize` getter. This only shows up in
production; local `cds watch` never sets `NODE_ENV=production`, so it's
easy to not notice until deployed. That's why `QuoteItemsService` has
`@(requires: 'any')` in `srv/quote-items-service.cds` — without it, it
would silently start requiring login the moment it hit CF, breaking the
C4C mashup. Any new service that should stay public needs the same
`requires: 'any'` annotation.

**`QuoteItemsService` has no authentication — deliberate, see "Open items".**

**`PricingService`** currently has a lightweight **interim lock**: a single
hardcoded account (HTTP Basic Auth, `kind: 'basic'` in CAP, no XSUAA/
`@sap/xssec` involved), configured in `srv/server.js`. Real BTP-user/role-
based restriction via XSUAA was built and verified end to end (CAP-level
`@requires`, an approuter, `xs-security.json` with a role collection), then
intentionally deactivated because it required `@sap/xssec`, which turned
into a real deployment headache (see git log around "Fix @sap/xssec missing
at runtime" and "Deactivate PricingService auth"). That work resumes as its
own OBO/authorization phase — see "Open items". The groundwork is still in
the repo: `xs-security.json` and `app/router/` (approuter config), just not
wired into `mta.yaml`/`package.json` right now.

**The interim lock**, concretely:
- One account: email `abdul.nandalpad@trelleborg.com` (default; override via
  `PRICING_ADMIN_EMAIL` on both `NewC4CQuote-srv` and `tss-pricing-ai`),
  password from `PRICING_ADMIN_PASSWORD` — **not committed anywhere**; set it
  with `cf set-env NewC4CQuote-srv PRICING_ADMIN_PASSWORD '...'` then
  `cf restage NewC4CQuote-srv`. Unset = nobody can log in (fails closed).
- Enforced server-side (`@(requires: 'authenticated-user')` on
  `PricingService` in `srv/pricing-service.cds`), so it's protected
  regardless of how it's reached.
- `tss-pricing-ai`'s React UI has a matching login screen (password
  only, email is fixed) that stores the credential in `sessionStorage` and
  attaches it as a `Basic` auth header to `/pricing` calls.

## Local development

Terminal 1 — backend:
```
npm install
PRICING_ADMIN_PASSWORD=devpass npm start   # cds-serve on http://localhost:4004
```
Without `PRICING_ADMIN_PASSWORD` set, `PricingService` still boots fine but
nobody (including the TSS Pricing AI UI) can log in — see "Access
control".

Terminal 2 — pricing simulation UI:
```
cd app/tss-pricing-ai
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

## Pricing engine

`PricingService.calculatePrice` (in `srv/pricing-service.js`) implements the
real Trelleborg regional pricing formulas — see
[`docs/pricing-engine-spec.md`](docs/pricing-engine-spec.md) for the exact
math per region (Americas/Europe/China/India), ported 1:1 from the uploaded
prototype into `srv/lib/pricing-engine.js`.

- Pass `baseCost` explicitly to price a manual/simulated number (this is
  what `app/tss-pricing-ai` does today).
- Omit `baseCost` (or pass 0/null) to have it looked up live via
  `srv/lib/cost-provider.js`, which tries **ERP then BI Central Cost DB**,
  both reached through the **API6 middleware** — this is what makes the
  engine "the soul for pricing and quoting" rather than just a sandbox.
- If neither source has a cost (or API6 isn't configured), the function
  returns `{ error: "..." }` naming the correct ERP table/field to check —
  the same UX the original prototype had for a missing base cost.

**API6 is not wired to anything real yet** — `srv/lib/cost-provider.js` calls
placeholder paths (`/erp/cost/<region>`, `/bi-central-cost-db/cost`) and
expects a `{ unitCost: <number> }` response. Once the real contract is
known, update `ERP_COST_PATH` / `parseCostResponse` in that file. The
connectivity plumbing (BTP Destination service, bound to `srv`) is already
in `mta.yaml`; what's still needed:
1. In BTP Cockpit → Connectivity → Destinations, create a destination named
   **`API6`** pointing at the real middleware URL, with whatever auth your
   API6 setup uses.
2. Confirm the actual endpoint paths and response shape for "get unit cost
   for part X in region Y" (ERP) and the BI Central Cost DB equivalent, and
   adjust `cost-provider.js` accordingly.

**Not yet implemented (explicitly deferred, not just missing):** pulling
pricing engine inputs from a C4C Opportunity when it's converted to a Quote.
See `docs/pricing-engine-spec.md` for what that will need once we get to it.

### Rate configuration

The constants in the formulas above (freight/duty/tariff/markup rates, pick
charges, etc.) are **not hardcoded** — they live in `db.PricingRateConfig`
(seeded from `db/data/c4cquote.db-PricingRateConfig.csv`), are exposed as
`PricingService.RateConfig`, and are editable from `tss-pricing-ai`'s
**Admin: Rate Config** tab. Edits apply immediately to every subsequent
`calculatePrices` call — `srv/pricing-service.js`'s `loadRates()` reads
current values from the DB on every call rather than caching them.

### Multi-item calculator + Excel upload

`tss-pricing-ai`'s Calculator tab prices any number of line items in one
batch (`calculatePrices` takes `many PriceCalculationInput`), each with its
own region, cost/currency, and region-specific fields, plus **Fetch from
ERP** / **Fetch from BI Central Cost DB** buttons per line. **Download
template** / **Upload Excel** round-trip every one of those fields through
an `.xlsx` file (`app/tss-pricing-ai/src/fields.js`'s `EXCEL_COLUMNS`),
so a user can fill in a spreadsheet of parts offline and get priced results
back without touching the UI form at all.

## MCP server (external agent access)

`app/mcp-server` is a small [MCP](https://modelcontextprotocol.io) server
(Streamable HTTP transport) that lets an external AI agent query pricing
the same way the UI does. It's deployed as its own Cloud Foundry app
(`pricing-mcp-server` in `mta.yaml`) and proxies straight through to
`PricingService` — it holds no logic and no credentials of its own.

- **Endpoint:** `POST <pricing-mcp-server-url>/mcp` (Streamable HTTP,
  stateless — one request/response per call, no session ID, no SSE stream).
- **Auth:** pass the same PricingUser `Authorization: Basic <base64
  email:password>` header the TSS Pricing AI UI uses. The MCP server
  does not validate it itself — it forwards the header untouched to
  `PricingService` on every tool call, so CAP's own `requires:
  'authenticated-user'` check is what actually accepts or rejects it. A
  request with no `Authorization` header at all is rejected by the MCP
  server before it even opens an MCP session (`401`); a request with wrong
  credentials opens a session fine (session init never touches
  PricingService) but every tool call then returns an auth error.
- **Tools:** `calculate_prices` (batch price calculation, same contract as
  the UI's Calculate All), `fetch_cost_from_erp` / `fetch_cost_from_bi`
  (single-part cost lookup), `get_rate_config` (read current rate
  constants, optionally filtered by region).
- **Local testing:** `cd app/mcp-server && npm install && API_ORIGIN=http://localhost:4004 npm start`
  (defaults to port 8082), then connect with any MCP client using
  `StreamableHTTPClientTransport` against `http://localhost:8082/mcp`.

## Deploying to Cloud Foundry (SAP BTP)

Requires the [Cloud MTA Build Tool](https://sap.github.io/cloud-mta-build-tool/)
(`mbt`) and the Cloud Foundry CLI, both logged into your BTP subaccount.

```
npm install -g mbt
mbt build
cf deploy mta_archives/NewC4CQuote_1.0.0.mtar
```

After deploying, set the interim lock's password (see "Access control"
above) — without this nobody, including you, can use `tss-pricing-ai`:
```
cf set-env NewC4CQuote-srv PRICING_ADMIN_PASSWORD 'choose-something'
cf restage NewC4CQuote-srv
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

- **Authorization (OBO/XSUAA)** — deliberately parked as its own upcoming
  phase, for both apps: restricting `tss-pricing-ai` to specific BTP
  users, and finding a workable auth story for `quote-items` (can't be an
  interactive login redirect inside a small iframe tab — options include a
  signed token passed as a mashup parameter, IP/network restriction, or a
  service-to-service trust between C4C and this app). The `tss-pricing-ai`
  side was already built and verified once (CAP-level `@requires`, an
  approuter, `xs-security.json` with a role collection) — see "Architecture"
  above for how to reactivate it. Known follow-ups for when that resumes:
  CSRF protection was left off on the approuter's proxy route
  (`app/router/xs-app.json`, `csrfProtection: false`) since the React client
  doesn't implement the token-fetch handshake yet; and `tss-pricing-ai`'s
  own direct CF route should probably be network-isolated (`no-route` +
  internal domain) rather than just relying on the CAP-level role check.
- **Real C4C data integration**: today `QuoteItems` is our own copy, keyed
  by `c4cQuoteId`/`c4cItemId`. Reading/writing the actual C4C quote will
  need a Communication Arrangement + OData API call from `srv/`.
- **Persistence**: SQLite → HANA Cloud or PostgreSQL hyperscaler option.
- **The "AI replacement" feature itself** — not yet specified.
- **API6 destination**: the real pricing engine is implemented (see
  "Pricing engine" above) but not wired to a live API6 endpoint yet —
  needs the destination configured and the endpoint contract confirmed.
- **Opportunity → Quote data pull** — explicitly parked for now. When a C4C
  Opportunity is converted to a Quote (standard C4C flow), the pricing
  engine/quote item inputs should be populated from the Opportunity
  automatically. Not designed yet — see `docs/pricing-engine-spec.md`.
- **Priority** between building out Part 1 (TSS Pricing AI) vs. Part 2
  (quote items + AI replacement) — TBD.
