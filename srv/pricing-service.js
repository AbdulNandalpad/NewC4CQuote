import cds from '@sap/cds'
import { calculateRegionalPrice, ERP_COST_SOURCES } from './lib/pricing-engine.js'
import { getBaseCost, fetchFromERP, fetchFromBI } from './lib/cost-provider.js'

async function loadRates() {
  const rows = await cds.run(SELECT.from('c4cquote.db.PricingRateConfig'))
  const rates = {}
  for (const row of rows) {
    ;(rates[row.region] ??= {})[row.paramKey] = Number(row.value)
  }
  return rates
}

async function calculateOne(item, rates) {
  const {
    lineId,
    region,
    partNumber,
    quantity,
    baseCost: baseCostOverride,
    currency,
    stockClass,
    mroq,
    shipFrom,
    freightPct,
    dutyPct,
    supplierSource,
    countryOfOrigin,
    applyLocalMarkups,
    supplierType,
  } = item

  if (!region) {
    return { lineId, partNumber, currency, error: 'region is required' }
  }

  const qty = quantity && quantity > 0 ? quantity : 1
  let baseCost = baseCostOverride
  let costSource = 'Manual entry'

  if (baseCost == null || baseCost <= 0) {
    const looked = await getBaseCost({ partNumber, region })
    if (looked.baseCost == null) {
      const src = ERP_COST_SOURCES[region]
      return {
        lineId,
        partNumber,
        currency,
        baseCost: null,
        unitPrice: null,
        totalPrice: null,
        scenario: null,
        costSource: null,
        breakdown: [],
        error:
          `No base cost found for this part/region combination` +
          (looked.error ? ` (${looked.error})` : '') +
          `. Check ${src.table} — field ${src.field} — or enter a base cost manually.`,
      }
    }
    baseCost = looked.baseCost
    costSource = looked.source
  }

  const result = calculateRegionalPrice(
    region,
    { baseCost, quantity: qty, stockClass, mroq, shipFrom, freightPct, dutyPct, supplierSource, countryOfOrigin, applyLocalMarkups, supplierType },
    rates,
  )

  return {
    lineId,
    partNumber,
    currency,
    baseCost,
    unitPrice: result.unitPrice,
    totalPrice: result.unitPrice * qty,
    scenario: result.scenario,
    costSource,
    breakdown: result.breakdown,
    error: null,
  }
}

export default class PricingService extends cds.ApplicationService {
  init() {
    this.on('calculatePrices', async (req) => {
      const items = req.data.items || []
      const rates = await loadRates()
      return Promise.all(items.map((item) => calculateOne(item, rates)))
    })

    this.on('fetchCostFromERP', async (req) => {
      return fetchFromERP({ partNumber: req.data.partNumber, region: req.data.region })
    })

    this.on('fetchCostFromBI', async (req) => {
      return fetchFromBI({ partNumber: req.data.partNumber, region: req.data.region })
    })

    return super.init()
  }
}
