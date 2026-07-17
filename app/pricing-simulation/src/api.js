export const API_BASE = `${window.__CONFIG__?.apiOrigin || ''}/pricing`

async function request(authHeader, path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: authHeader,
      ...options.headers,
    },
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`)
  return data
}

export function calculatePrices(authHeader, items) {
  return request(authHeader, '/calculatePrices', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }).then((d) => d.value)
}

export function fetchCostFromERP(authHeader, region, partNumber) {
  return request(authHeader, `/fetchCostFromERP(region='${region}',partNumber='${encodeURIComponent(partNumber || '')}')`)
}

export function fetchCostFromBI(authHeader, region, partNumber) {
  return request(authHeader, `/fetchCostFromBI(region='${region}',partNumber='${encodeURIComponent(partNumber || '')}')`)
}

export function listRateConfig(authHeader) {
  return request(authHeader, '/RateConfig?$orderby=region,paramKey').then((d) => d.value)
}

export function updateRateConfig(authHeader, id, value) {
  return request(authHeader, `/RateConfig(${id})`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  })
}

export function checkLogin(authHeader) {
  return fetch(`${API_BASE}/Simulations?$top=1`, { headers: { Authorization: authHeader } })
}
