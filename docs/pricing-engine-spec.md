# Pricing Engine — Requirements & Calculation Spec

Source: Trelleborg Sealing Solutions "Global Pricing Engine" simulator
(uploaded prototype, region-selectable calculator). This document transcribes
its calculation logic as the authoritative business rules for the real
pricing engine — the prototype itself is a standalone JS mock with no live
ERP connection; this spec is what needs to be reimplemented server-side
(in `srv/`) against real data.

**Status: OPEN.** Not yet implemented. Captured here so the logic and the
integration requirements below aren't lost before we get to build it.

## Why this matters more than a generic pricing-simulation calc

This is described as "the soul for pricing and quoting" — i.e. this isn't a
side calculator, it's meant to become the actual pricing logic used for real
quotes, not just the standalone `app/pricing-simulation` sandbox. When this
gets built, it needs:

1. **Live base cost lookup**, not manual entry — from ERP and from the "BI
   Central Cost DB", both reached via the **API6 middleware** integration
   layer (a Trelleborg-side integration platform/API gateway; protocol,
   auth, and endpoint details TBD — need to gather these before building
   the connector).
2. **Opportunity → Quote data pull**: when a C4C Opportunity is converted to
   a Quote (standard C4C flow), this app must pick up the relevant data
   (product/part, quantity, customer, region, etc.) from the Opportunity
   automatically rather than requiring re-entry.

Both are open integration points — not yet designed, just flagged here.

## Regional calculation logic

All four regions take a **Base Cost** (per unit) and **Quantity** as input.
Where the prototype couldn't find a base cost, it prompts the user to check
a specific ERP source — those source hints are recorded per region below,
since they indicate where live base cost lookup needs to read from.

### Americas

- Base cost source (when missing): ERP table **F4105 (MTS)** / **F41061
  (Non-MTS)**, field **Unit Cost**.
- Inputs: Stock Class (`MTS` / `Non-MTS`), MROQ Present (`yes`/`no`),
  Ship-From (`Domestic`/`Overseas`).
- Scenario label only (doesn't change the formula in the prototype — flag
  this as a likely gap to resolve when building the real version):
  - MTS + no MROQ → Scenario A
  - MTS + MROQ → Scenario B
  - Non-MTS + no MROQ → Scenario C
  - Non-MTS + MROQ → Scenario D
- Formula:
  ```
  freight = base × 3.5%      (LVLA=3)
  duty    = base × 2.2%      (LVLA=7)
  tariff  = base × 1.5%      (LVLA=8)
  subtotal = base + freight + duty + tariff
  lca = subtotal × (6.7% if Domestic else 10.5%)   ("LCA Handling Fee")
  pick = 34 / quantity                              (flat $34, spread over qty)
  unit_price = subtotal + lca + pick
  ```

### Europe

- Base cost source (when missing): SAP Material Master **MBEW**, field
  **Moving Average Price (VPRS)** for MTS; "CCD Catalog Cost" for Non-MTS.
- Inputs: Stock Class (`MTS` / `Non-MTS`); for Non-MTS only, Freight % and
  Duty % (manually entered in the prototype — likely need a real per-part
  or per-supplier source for these).
- Pick charge: `21 / quantity` (flat €21 spread over qty).
- MTS formula:
  ```
  scm_markup = base × 4.7%
  unit_price = base + scm_markup + pick
  ```
- Non-MTS formula:
  ```
  freight = base × freight%
  duty    = base × duty%
  markup  = (base + freight + duty) × 4.7%
  unit_price = base + freight + duty + markup + pick
  ```

### China

- Base cost source (when missing): **JDE China F4105** / **SAP PIR**
  (fallback), field **Unit Cost**.
- Inputs: Supplier Source (`JDE China Direct` / `SAP Europe Fallback`);
  Country of Origin (`US` / `not US`, only relevant for the SAP Europe
  Fallback path); Apply Local Markups (`LCE 6% + LCS 3.2%` / `None`).
- JDE China Direct (labeled UC1/UC2):
  ```
  unit_price = base × 1.032        (LCS factor)
  ```
- SAP Europe Fallback (labeled UC3/UC4 if COO=US, UC5/UC6 if COO≠US):
  ```
  fd_factor = 1.32 if COO=US else 1.21
  unit_price = base × fd_factor
  ```
- If "Apply Local Markups" is on, layer on top of whichever base above:
  ```
  lce  = unit_price × 6%
  lcs2 = unit_price × 3.2%
  unit_price = unit_price + lce + lcs2
  ```

### India

- Base cost source (when missing): **Fourth Shift — Item Cost File**,
  field **Standard Cost**.
- Input: Supplier Type (`Local` / `Overseas`).
- Local: `unit_price = base` (landed cost = base cost, no markup).
- Overseas: `unit_price = base + (base × 40%)`.

## Open items before this can be built for real

- API6 middleware: protocol (REST/OData/SOAP), auth, and the actual
  endpoints for (a) ERP cost lookup per region and (b) BI Central Cost DB.
- Whether Americas' MROQ toggle is actually meant to change the formula
  (the prototype only changes the scenario label, not the math) — confirm
  with the business owner.
- Where Europe's per-part Freight%/Duty% should come from once this isn't
  manually typed in (per-supplier table? per-part master data?).
- Design of the Opportunity → Quote data handoff (which C4C Opportunity
  fields map to which pricing engine inputs).
- How this relates to `db/schema.cds` / `PricingSimulations` — likely this
  becomes the real calculation behind quote line items, not a separate
  standalone tool, once ERP connectivity exists.
