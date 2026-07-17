// Regional pricing formulas, ported 1:1 from docs/pricing-engine-spec.md
// (itself transcribed from the Trelleborg Sealing Solutions pricing
// simulator prototype). Pure functions: {baseCost, quantity, ...toggles} in,
// {scenario, unitPrice, breakdown} out. No I/O here — cost lookup lives in
// cost-provider.js, dispatch/HTTP concerns live in the service handler.

export const ERP_COST_SOURCES = {
  americas: { table: 'F4105 (MTS) / F41061 (Non-MTS)', field: 'Unit Cost' },
  europe: { table: 'SAP Material Master — MBEW', field: 'Moving Average Price (VPRS)' },
  china: { table: 'JDE China F4105 / SAP PIR (fallback)', field: 'Unit Cost' },
  india: { table: 'Fourth Shift — Item Cost File', field: 'Standard Cost' },
}

function calcAmericas({ baseCost, quantity, stockClass, mroq, shipFrom }) {
  let scenario
  if (stockClass === 'MTS' && !mroq) scenario = 'Scenario A'
  else if (stockClass === 'MTS' && mroq) scenario = 'Scenario B'
  else if (stockClass === 'NONMTS' && !mroq) scenario = 'Scenario C'
  else scenario = 'Scenario D'

  const freightRate = 0.035 // LVLA=3
  const dutyRate = 0.022 // LVLA=7
  const tariffRate = 0.015 // LVLA=8
  const lcaRate = shipFrom === 'domestic' ? 0.067 : 0.105
  const pick = 34 / quantity

  const freight = baseCost * freightRate
  const duty = baseCost * dutyRate
  const tariff = baseCost * tariffRate
  const subtotal = baseCost + freight + duty + tariff
  const lca = subtotal * lcaRate
  const unitPrice = subtotal + lca + pick

  return {
    scenario: `${scenario} — ${stockClass}${mroq ? ' + MROQ' : ''}`,
    unitPrice,
    breakdown: [
      { label: 'Base Cost', value: baseCost },
      { label: `Freight (LVLA=3, ${(freightRate * 100).toFixed(1)}%)`, value: freight },
      { label: `Duty (LVLA=7, ${(dutyRate * 100).toFixed(1)}%)`, value: duty },
      { label: `Tariff (LVLA=8, ${(tariffRate * 100).toFixed(1)}%)`, value: tariff },
      { label: `LCA Handling Fee (${shipFrom}, ${(lcaRate * 100).toFixed(1)}%)`, value: lca },
      { label: `Pick Charge ($34 ÷ ${quantity})`, value: pick },
    ],
  }
}

function calcEurope({ baseCost, quantity, stockClass, freightPct, dutyPct }) {
  const pick = 21 / quantity

  if (stockClass === 'MTS') {
    const scm = baseCost * 0.047
    const unitPrice = baseCost + scm + pick
    return {
      scenario: 'MTS — SAP Moving Average',
      unitPrice,
      breakdown: [
        { label: 'SAP Moving Average Price', value: baseCost },
        { label: 'SCM Markup (4.7%)', value: scm },
        { label: `Pick Charge (€21 ÷ ${quantity})`, value: pick },
      ],
    }
  }

  const fPct = freightPct ?? 0
  const dPct = dutyPct ?? 0
  const freight = baseCost * (fPct / 100)
  const duty = baseCost * (dPct / 100)
  const markup = (baseCost + freight + duty) * 0.047
  const unitPrice = baseCost + freight + duty + markup + pick

  return {
    scenario: 'Non-MTS — CCD Supplier Catalog',
    unitPrice,
    breakdown: [
      { label: 'CCD Catalog Cost', value: baseCost },
      { label: `Freight (${fPct}%)`, value: freight },
      { label: `Duty (${dPct}%)`, value: duty },
      { label: 'SCM Markup (4.7%)', value: markup },
      { label: `Pick Charge (€21 ÷ ${quantity})`, value: pick },
    ],
  }
}

function calcChina({ baseCost, supplierSource, countryOfOrigin, applyLocalMarkups }) {
  let unitPrice
  let scenario
  const breakdown = []

  if (supplierSource === 'jde') {
    const lcs = baseCost * 1.032
    unitPrice = lcs
    scenario = 'UC1/UC2 — JDE China Direct'
    breakdown.push({ label: 'JDE China Base Cost', value: baseCost })
    breakdown.push({ label: 'LCS Factor (×1.032)', value: lcs - baseCost })
  } else {
    const fdFactor = countryOfOrigin === 'us' ? 1.32 : 1.21
    const fd = baseCost * fdFactor
    scenario = countryOfOrigin === 'us' ? 'UC3/UC4 — SAP Europe Fallback (COO=US)' : 'UC5/UC6 — SAP Europe Fallback (COO≠US)'
    unitPrice = fd
    breakdown.push({ label: 'SAP Europe Base Cost', value: baseCost })
    breakdown.push({ label: `F&D Factor (×${fdFactor})`, value: fd - baseCost })
  }

  if (applyLocalMarkups) {
    const lce = unitPrice * 0.06
    const lcs2 = unitPrice * 0.032
    breakdown.push({ label: 'LCE Markup (6%)', value: lce })
    breakdown.push({ label: 'LCS Markup (3.2%)', value: lcs2 })
    unitPrice = unitPrice + lce + lcs2
  }

  return { scenario, unitPrice, breakdown }
}

function calcIndia({ baseCost, supplierType }) {
  if (supplierType === 'local') {
    return {
      scenario: 'Local Supplier — BC = Landed Cost',
      unitPrice: baseCost,
      breakdown: [{ label: 'Landed Cost (BC)', value: baseCost }],
    }
  }

  const markup = baseCost * 0.4
  const unitPrice = baseCost + markup
  return {
    scenario: 'Overseas Supplier — BC + 40%',
    unitPrice,
    breakdown: [
      { label: 'Base Cost (BC)', value: baseCost },
      { label: 'Overseas Markup (40%)', value: markup },
    ],
  }
}

const CALCULATORS = {
  americas: calcAmericas,
  europe: calcEurope,
  china: calcChina,
  india: calcIndia,
}

export function calculateRegionalPrice(region, params) {
  const calc = CALCULATORS[region]
  if (!calc) throw new Error(`Unknown region: ${region}`)
  return calc(params)
}
