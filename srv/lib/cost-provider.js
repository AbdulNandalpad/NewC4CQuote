import cds from '@sap/cds'

const LOG = cds.log('cost-provider')

// PLACEHOLDER paths — the real API6 middleware contract (endpoint paths,
// request/response shape, auth) hasn't been shared yet. These are named to
// be self-explanatory and easy to swap once that's known. The response is
// assumed to look like `{ unitCost: <number> }`; adjust `parseCostResponse`
// once the real shape is confirmed.
const ERP_COST_PATH = {
  americas: '/erp/cost/americas',
  europe: '/erp/cost/europe',
  china: '/erp/cost/china',
  india: '/erp/cost/india',
}
const BI_CENTRAL_COST_DB_PATH = '/bi-central-cost-db/cost'

function parseCostResponse(body) {
  const value = body?.unitCost ?? body?.UnitCost ?? body?.value
  return typeof value === 'number' ? value : null
}

async function connectToApi6() {
  try {
    return await cds.connect.to('API6')
  } catch (err) {
    LOG.warn('API6 destination not configured — live cost lookup unavailable', err.message)
    return null
  }
}

/**
 * Looks up a part's base unit cost, first from ERP then from the BI Central
 * Cost DB, both reached through the API6 middleware. Returns
 * { baseCost, source } on success, or { baseCost: null, error } if neither
 * source has it (or API6 isn't reachable) — callers should fall back to
 * asking for a manual base cost in that case, same as the original
 * simulator prototype's "base cost missing" flow.
 */
export async function getBaseCost({ partNumber, region }) {
  const api6 = await connectToApi6()
  if (!api6) {
    return { baseCost: null, source: null, error: 'API6 destination is not configured in this environment.' }
  }

  try {
    const erpPath = ERP_COST_PATH[region]
    const erpResponse = await api6.get(erpPath, { partNumber })
    const erpCost = parseCostResponse(erpResponse)
    if (erpCost != null) return { baseCost: erpCost, source: 'ERP via API6' }
  } catch (err) {
    LOG.warn(`ERP cost lookup via API6 failed for ${partNumber}/${region}`, err.message)
  }

  try {
    const biResponse = await api6.get(BI_CENTRAL_COST_DB_PATH, { partNumber, region })
    const biCost = parseCostResponse(biResponse)
    if (biCost != null) return { baseCost: biCost, source: 'BI Central Cost DB via API6' }
  } catch (err) {
    LOG.warn(`BI Central Cost DB lookup via API6 failed for ${partNumber}/${region}`, err.message)
  }

  return { baseCost: null, source: null, error: 'No base cost found in ERP or BI Central Cost DB.' }
}
