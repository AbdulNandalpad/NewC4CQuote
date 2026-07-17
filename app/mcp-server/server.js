import express from 'express'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

// Every tool call is a plain pass-through to PricingService using the
// caller's own Authorization header — there is no separate MCP credential
// store. Whoever calls this server authenticates as the same PricingUser
// account (Basic Auth) already used by the pricing-simulation UI; the CAP
// backend (requires: 'authenticated-user') is what actually accepts or
// rejects the credentials on each call, exactly as it does for the UI.
const PRICING_API = `${process.env.API_ORIGIN || 'http://localhost:4004'}/pricing`

async function callPricing(authHeader, path, options = {}) {
  const res = await fetch(`${PRICING_API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: authHeader,
      ...options.headers,
    },
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    if (!res.ok) throw new Error(res.status === 401 ? 'Unauthorized — check your PricingUser credentials.' : `Pricing service request failed (HTTP ${res.status}): ${text}`)
    throw new Error(`Pricing service returned a non-JSON response (HTTP ${res.status}): ${text}`)
  }
  if (!res.ok) throw new Error(data?.error?.message || `Pricing service request failed (HTTP ${res.status})`)
  return data
}

function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function errorResult(err) {
  return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
}

const regionEnum = z.enum(['americas', 'europe', 'china', 'india'])

const lineItemShape = {
  lineId: z.string().optional().describe('Client-chosen id echoed back on the matching result; auto-assigned if omitted.'),
  region: regionEnum.describe('Pricing region — determines which formula applies.'),
  partNumber: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  baseCost: z.number().nullable().optional().describe('Unit base cost. Omit/null to look it up live via ERP then BI Central Cost DB.'),
  currency: z.string().length(3).optional(),
  stockClass: z.enum(['MTS', 'NONMTS']).optional().describe('Americas/Europe only.'),
  mroq: z.boolean().optional().describe('Americas only.'),
  shipFrom: z.enum(['domestic', 'overseas']).optional().describe('Americas only.'),
  freightPct: z.number().optional().describe('Europe non-MTS only.'),
  dutyPct: z.number().optional().describe('Europe non-MTS only.'),
  supplierSource: z.enum(['jde', 'sap']).optional().describe('China only.'),
  countryOfOrigin: z.enum(['us', 'other']).optional().describe('China + SAP Europe fallback only.'),
  applyLocalMarkups: z.boolean().optional().describe('China only.'),
  supplierType: z.enum(['local', 'overseas']).optional().describe('India only.'),
}

function buildServer(authHeader) {
  const server = new McpServer({ name: 'c4c-pricing', version: '1.0.0' })

  server.registerTool(
    'calculate_prices',
    {
      title: 'Calculate regional prices',
      description:
        'Calculates unit and total price for one or more line items using the Trelleborg regional pricing formulas ' +
        '(Americas, Europe, China, India). Pass baseCost to price a manual/simulated number, or omit it to have the ' +
        'cost looked up live from ERP then BI Central Cost DB. Returns, per line, unitPrice, totalPrice, the matched ' +
        'scenario, cost source, and a full cost breakdown — or an error naming the ERP field to check if no cost was found.',
      inputSchema: { items: z.array(z.object(lineItemShape)).min(1) },
    },
    async ({ items }) => {
      try {
        const data = await callPricing(authHeader, '/calculatePrices', {
          method: 'POST',
          body: JSON.stringify({ items }),
        })
        return textResult(data.value)
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  server.registerTool(
    'fetch_cost_from_erp',
    {
      title: 'Fetch base cost from ERP',
      description: 'Looks up a part\'s unit base cost from the ERP system for a given region.',
      inputSchema: { region: regionEnum, partNumber: z.string() },
    },
    async ({ region, partNumber }) => {
      try {
        const data = await callPricing(authHeader, `/fetchCostFromERP(region='${region}',partNumber='${encodeURIComponent(partNumber)}')`)
        return textResult(data)
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  server.registerTool(
    'fetch_cost_from_bi',
    {
      title: 'Fetch base cost from BI Central Cost DB',
      description: 'Looks up a part\'s unit base cost from the BI Central Cost DB for a given region.',
      inputSchema: { region: regionEnum, partNumber: z.string() },
    },
    async ({ region, partNumber }) => {
      try {
        const data = await callPricing(authHeader, `/fetchCostFromBI(region='${region}',partNumber='${encodeURIComponent(partNumber)}')`)
        return textResult(data)
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  server.registerTool(
    'get_rate_config',
    {
      title: 'Get current rate configuration',
      description:
        'Returns the current admin-configured rate constants (freight/duty/tariff/markup rates, pick charges, etc.) ' +
        'that drive the regional pricing formulas, optionally filtered to one region.',
      inputSchema: { region: regionEnum.optional() },
    },
    async ({ region }) => {
      try {
        const query = region ? `?$filter=region eq '${region}'&$orderby=paramKey` : '?$orderby=region,paramKey'
        const data = await callPricing(authHeader, `/RateConfig${query}`)
        return textResult(data.value)
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  return server
}

const app = express()
app.use(express.json())

app.post('/mcp', async (req, res) => {
  const authHeader = req.headers['authorization']
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header. Connect using the same PricingUser Basic Auth credentials as the pricing-simulation app.' })
    return
  }

  const server = buildServer(authHeader)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message })
  }
})

// This server runs stateless (no session persistence, no server-initiated
// notifications), so GET (SSE stream) and DELETE (session teardown) aren't
// meaningful here — only POST request/response is supported.
app.get('/mcp', (_req, res) => res.status(405).json({ error: 'Method not allowed: this MCP endpoint is stateless (POST only).' }))
app.delete('/mcp', (_req, res) => res.status(405).json({ error: 'Method not allowed: this MCP endpoint is stateless (POST only).' }))

app.get('/health', (_req, res) => res.json({ ok: true }))

const port = process.env.PORT || 8082
app.listen(port, () => console.log(`c4c-pricing MCP server listening on ${port}, proxying to ${PRICING_API}`))
