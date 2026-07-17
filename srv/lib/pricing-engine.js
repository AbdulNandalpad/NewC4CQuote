// Regional pricing formulas, ported 1:1 from docs/pricing-engine-spec.md
// (itself transcribed from the Trelleborg Sealing Solutions pricing
// simulator prototype). Pure functions: ({baseCost, quantity, ...toggles},
// rates) in, {scenario, unitPrice, breakdown} out. Rates come from
// PricingRateConfig (srv/pricing-service.js loads and shapes them) rather
// than being hardcoded here, so they're admin-editable. No I/O in this
// file — cost lookup lives in cost-provider.js, dispatch/HTTP concerns
// live in the service handler.

export const ERP_COST_SOURCES = {
  americas: { table: 'F4105 (MTS) / F41061 (Non-MTS)', field: 'Unit Cost' },
  europe: { table: 'SAP Material Master — MBEW', field: 'Moving Average Price (VPRS)' },
  china: { table: 'JDE China F4105 / SAP PIR (fallback)', field: 'Unit Cost' },
  india: { table: 'Fourth Shift — Item Cost File', field: 'Standard Cost' },
}

// Defaults mirror the values originally hardcoded here; only used if a
// PricingRateConfig row is somehow missing (e.g. a fresh, unseeded db).
export const DEFAULT_RATES = {
  americas: { freightRate: 0.035, dutyRate: 0.022, tariffRate: 0.015, lcaRateDomestic: 0.067, lcaRateOverseas: 0.105, pickCharge: 34 },
  europe: { scmMarkupRate: 0.047, pickCharge: 21 },
  china: { lcsFactor: 1.032, fdFactorUS: 1.32, fdFactorOther: 1.21, lceMarkupRate: 0.06, lcsMarkupRate: 0.032 },
  india: { overseasMarkupRate: 0.4 },
}

function calcAmericas({ baseCost, quantity, stockClass, mroq, shipFrom }, rates) {
  const r = { ...DEFAULT_RATES.americas, ...rates }
  let scenario
  if (stockClass === 'MTS' && !mroq) scenario = 'Scenario A'
  else if (stockClass === 'MTS' && mroq) scenario = 'Scenario B'
  else if (stockClass === 'NONMTS' && !mroq) scenario = 'Scenario C'
  else scenario = 'Scenario D'

  const lcaRate = shipFrom === 'domestic' ? r.lcaRateDomestic : r.lcaRateOverseas
  const pick = r.pickCharge / quantity

  const freight = baseCost * r.freightRate
  const duty = baseCost * r.dutyRate
  const tariff = baseCost * r.tariffRate
  const subtotal = baseCost + freight + duty + tariff
  const lca = subtotal * lcaRate
  const unitPrice = subtotal + lca + pick

  return {
    scenario: `${scenario} — ${stockClass}${mroq ? ' + MROQ' : ''}`,
    unitPrice,
    breakdown: [
      { label: 'Base Cost', value: baseCost },
      { label: `Freight (LVLA=3, ${(r.freightRate * 100).toFixed(1)}%)`, value: freight },
      { label: `Duty (LVLA=7, ${(r.dutyRate * 100).toFixed(1)}%)`, value: duty },
      { label: `Tariff (LVLA=8, ${(r.tariffRate * 100).toFixed(1)}%)`, value: tariff },
      { label: `LCA Handling Fee (${shipFrom}, ${(lcaRate * 100).toFixed(1)}%)`, value: lca },
      { label: `Pick Charge ($${r.pickCharge} ÷ ${quantity})`, value: pick },
    ],
  }
}

function calcEurope({ baseCost, quantity, stockClass, freightPct, dutyPct }, rates) {
  const r = { ...DEFAULT_RATES.europe, ...rates }
  const pick = r.pickCharge / quantity

  if (stockClass === 'MTS') {
    const scm = baseCost * r.scmMarkupRate
    const unitPrice = baseCost + scm + pick
    return {
      scenario: 'MTS — SAP Moving Average',
      unitPrice,
      breakdown: [
        { label: 'SAP Moving Average Price', value: baseCost },
        { label: `SCM Markup (${(r.scmMarkupRate * 100).toFixed(1)}%)`, value: scm },
        { label: `Pick Charge (€${r.pickCharge} ÷ ${quantity})`, value: pick },
      ],
    }
  }

  const fPct = freightPct ?? 0
  const dPct = dutyPct ?? 0
  const freight = baseCost * (fPct / 100)
  const duty = baseCost * (dPct / 100)
  const markup = (baseCost + freight + duty) * r.scmMarkupRate
  const unitPrice = baseCost + freight + duty + markup + pick

  return {
    scenario: 'Non-MTS — CCD Supplier Catalog',
    unitPrice,
    breakdown: [
      { label: 'CCD Catalog Cost', value: baseCost },
      { label: `Freight (${fPct}%)`, value: freight },
      { label: `Duty (${dPct}%)`, value: duty },
      { label: `SCM Markup (${(r.scmMarkupRate * 100).toFixed(1)}%)`, value: markup },
      { label: `Pick Charge (€${r.pickCharge} ÷ ${quantity})`, value: pick },
    ],
  }
}

function calcChina({ baseCost, supplierSource, countryOfOrigin, applyLocalMarkups }, rates) {
  const r = { ...DEFAULT_RATES.china, ...rates }
  let unitPrice
  let scenario
  const breakdown = []

  if (supplierSource === 'jde') {
    const lcs = baseCost * r.lcsFactor
    unitPrice = lcs
    scenario = 'UC1/UC2 — JDE China Direct'
    breakdown.push({ label: 'JDE China Base Cost', value: baseCost })
    breakdown.push({ label: `LCS Factor (×${r.lcsFactor})`, value: lcs - baseCost })
  } else {
    const fdFactor = countryOfOrigin === 'us' ? r.fdFactorUS : r.fdFactorOther
    const fd = baseCost * fdFactor
    scenario = countryOfOrigin === 'us' ? 'UC3/UC4 — SAP Europe Fallback (COO=US)' : 'UC5/UC6 — SAP Europe Fallback (COO≠US)'
    unitPrice = fd
    breakdown.push({ label: 'SAP Europe Base Cost', value: baseCost })
    breakdown.push({ label: `F&D Factor (×${fdFactor})`, value: fd - baseCost })
  }

  if (applyLocalMarkups) {
    const lce = unitPrice * r.lceMarkupRate
    const lcs2 = unitPrice * r.lcsMarkupRate
    breakdown.push({ label: `LCE Markup (${(r.lceMarkupRate * 100).toFixed(1)}%)`, value: lce })
    breakdown.push({ label: `LCS Markup (${(r.lcsMarkupRate * 100).toFixed(1)}%)`, value: lcs2 })
    unitPrice = unitPrice + lce + lcs2
  }

  return { scenario, unitPrice, breakdown }
}

function calcIndia({ baseCost, supplierType }, rates) {
  const r = { ...DEFAULT_RATES.india, ...rates }
  if (supplierType === 'local') {
    return {
      scenario: 'Local Supplier — BC = Landed Cost',
      unitPrice: baseCost,
      breakdown: [{ label: 'Landed Cost (BC)', value: baseCost }],
    }
  }

  const markup = baseCost * r.overseasMarkupRate
  const unitPrice = baseCost + markup
  return {
    scenario: 'Overseas Supplier — BC + 40%',
    unitPrice,
    breakdown: [
      { label: 'Base Cost (BC)', value: baseCost },
      { label: `Overseas Markup (${(r.overseasMarkupRate * 100).toFixed(1)}%)`, value: markup },
    ],
  }
}

const CALCULATORS = {
  americas: calcAmericas,
  europe: calcEurope,
  china: calcChina,
  india: calcIndia,
}

export function calculateRegionalPrice(region, params, rates) {
  const calc = CALCULATORS[region]
  if (!calc) throw new Error(`Unknown region: ${region}`)
  return calc(params, rates?.[region] || {})
}
