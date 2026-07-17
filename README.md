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
  pricing-service.cds     — requires the PricingUser XSUAA role
  quote-items-service.cds — deliberately open, no auth (see below)
db/schema.cds        Data model for both services
app/pricing-simulation/   React (Vite) UI + a tiny Express static server
app/router/               approuter — the only supported entry point for Part 1
app/quote-items/          React (Vite) UI + a tiny Express static server
mta.yaml              Cloud Foundry MTA: srv, pricing-simulation, pricing-approuter, quote-items
xs-security.json      XSUAA scope/role/role-collection for pricing-approuter
```

The two apps are deliberately architected differently, because they have
opposite access requirements:

**`quote-items`** is its own standalone Cloud Foundry app, reached directly,
no approuter in front of it. An approuter+XSUAA gateway forces an
interactive login redirect, which would break an app that's meant to be
silently iframed inside a C4C mashup. Instead:
- The CAP backend allows cross-origin requests from its UI origin (CORS,
  see `srv/server.js`, configured via the `ALLOWED_ORIGINS` env var).
- It's served by a minimal Express server (`server.js`) instead of a static
  buildpack, so we have full control over response headers and can inject
  the backend's URL at **runtime** (via `/runtime-config.js`, reading an
  `API_ORIGIN` env var) rather than baking it in at build time — CF only
  assigns routes at push time, so build-time env vars don't work here.
- It additionally sets `Content-Security-Policy: frame-ancestors
  <FRAME_ANCESTORS>` on every response, which is what allows C4C to iframe
  it at all (see below).
- **No authentication is enforced on `quote-items`/`QuoteItemsService`** —
  still an open item, see "Open items".

**`pricing-simulation`** is the opposite: an internal tool that should only
be usable by specific BTP users, so it sits behind `pricing-approuter` +
XSUAA. See "Access control" below.

## Access control

`PricingService` (everything under `/pricing`, including `calculatePrice`)
requires the **`PricingUser`** XSUAA role — enforced by CAP itself
(`@(requires: 'PricingUser')` in `srv/pricing-service.cds`), not just by the
approuter sitting in front of it, so it's protected even if someone finds
`pricing-simulation`'s own direct CF URL.

To grant access: in **BTP Cockpit → Security → Users**, assign the
**"Pricing Simulation User"** role collection (defined in `xs-security.json`,
created automatically on deploy) to specific people. Nobody has it by
default — deploying this doesn't grant anyone access; that's a separate,
deliberate admin action.

`QuoteItemsService` has no such restriction — see "Open items" for why.

**Local dev note:** the approuter's login redirect only works when deployed
(it needs a real XSUAA service binding). Locally, `cds watch` uses CAP's
built-in mocked-auth users configured in `package.json`
(`alice`/`alice`, who has `PricingUser`; `bob`/`bob`, who doesn't) — test
with Basic Auth, e.g.:
```
curl -u alice:alice -X POST http://localhost:4004/pricing/calculatePrice \
  -H 'Content-Type: application/json' -d '{"region":"india","baseCost":100,"supplierType":"local"}'
```
The `pricing-simulation` React UI itself doesn't implement a login form, so
exercising the full click-through flow currently only works once deployed,
through `pricing-approuter`.

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
Note: since PricingService now requires the PricingUser role, calls made
from the browser UI here will get 401/403 — use the curl example above to
exercise the backend directly during local dev.

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
  what `app/pricing-simulation` does today).
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

After deploying, nobody can use `pricing-simulation` yet — go to **BTP
Cockpit → Security → Users** and assign the **"Pricing Simulation User"**
role collection to whoever should have access. See "Access control" above.

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

- **Auth strategy for `quote-items`** (can't be an interactive login redirect
  inside a small iframe tab, unlike `pricing-simulation` which now has one)
  — options include a signed token passed as a mashup parameter, IP/network
  restriction, or a service-to-service trust between C4C and this app.
- **CSRF protection is disabled** on `pricing-approuter`'s route to `srv-api`
  (`app/router/xs-app.json`, `csrfProtection: false`) — the React client
  doesn't yet implement the token-fetch round trip approuter's CSRF
  protection expects. Worth revisiting once `pricing-simulation` does
  anything more sensitive than run a calculation.
- **`pricing-simulation`'s direct CF route still exists** — `pricing-approuter`
  is the intended entry point, but nothing currently removes or network-
  isolates the backing app's own public route. `PricingService` itself
  still enforces the `PricingUser` role either way (defense in depth), so
  direct access just fails rather than leaking data — but locking the route
  down fully (e.g. `no-route`/internal domain) is a reasonable hardening
  follow-up.
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
- **Priority** between building out Part 1 (pricing simulation) vs. Part 2
  (quote items + AI replacement) — TBD.
