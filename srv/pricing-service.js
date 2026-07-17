import cds from '@sap/cds'
import { calculateRegionalPrice, ERP_COST_SOURCES } from './lib/pricing-engine.js'
import { getBaseCost } from './lib/cost-provider.js'

export default class PricingService extends cds.ApplicationService {
  init() {
    this.on('calculatePrice', async (req) => {
      const {
        region,
        partNumber,
        quantity,
        baseCost: baseCostOverride,
        stockClass,
        mroq,
        shipFrom,
        freightPct,
        dutyPct,
        supplierSource,
        countryOfOrigin,
        applyLocalMarkups,
        supplierType,
      } = req.data

      if (!region) return req.error(400, 'region is required')

      const qty = quantity && quantity > 0 ? quantity : 1
      let baseCost = baseCostOverride
      let costSource = 'Manual entry'

      if (baseCost == null || baseCost <= 0) {
        const looked = await getBaseCost({ partNumber, region })
        if (looked.baseCost == null) {
          const src = ERP_COST_SOURCES[region]
          return {
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

      const result = calculateRegionalPrice(region, {
        baseCost,
        quantity: qty,
        stockClass,
        mroq,
        shipFrom,
        freightPct,
        dutyPct,
        supplierSource,
        countryOfOrigin,
        applyLocalMarkups,
        supplierType,
      })

      return {
        unitPrice: result.unitPrice,
        totalPrice: result.unitPrice * qty,
        scenario: result.scenario,
        costSource,
        breakdown: result.breakdown,
        error: null,
      }
    })

    return super.init()
  }
}
