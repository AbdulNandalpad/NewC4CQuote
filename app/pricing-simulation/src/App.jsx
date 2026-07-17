import { useEffect, useState } from 'react'
import './App.css'

const API_BASE = `${window.__CONFIG__?.apiOrigin || ''}/pricing`

// Interim lock: a single hardcoded account on the backend (srv/server.js),
// HTTP Basic Auth. Must match PRICING_ADMIN_EMAIL there if that's ever
// changed. Real BTP-user/role-based login is parked for later — see README.
const ADMIN_EMAIL = window.__CONFIG__?.adminEmail || 'abdul.nandalpad@trelleborg.com'
const AUTH_STORAGE_KEY = 'pricing-sim-auth'

function Login({ onSuccess }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setChecking(true)
    setError('')
    const authHeader = `Basic ${btoa(`${ADMIN_EMAIL}:${password}`)}`
    try {
      const res = await fetch(`${API_BASE}/Simulations?$top=1`, {
        headers: { Authorization: authHeader },
      })
      if (res.ok) {
        sessionStorage.setItem(AUTH_STORAGE_KEY, authHeader)
        onSuccess(authHeader)
      } else {
        setError('Wrong password.')
      }
    } catch {
      setError('Could not reach the pricing service.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className="app">
      <div className="login-box">
        <h1>Regional Pricing Simulation</h1>
        <p className="subtitle">Restricted — sign in as {ADMIN_EMAIL}.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          <button type="submit" className="calc-btn" disabled={checking}>
            {checking ? 'Checking…' : 'Sign In'}
          </button>
          {error && (
            <div className="alert-box show">
              <div className="alert-title">⚠ {error}</div>
            </div>
          )}
        </form>
      </div>
    </main>
  )
}

const REGIONS = [
  { key: 'americas', label: 'Americas' },
  { key: 'europe', label: 'Europe' },
  { key: 'china', label: 'China' },
  { key: 'india', label: 'India' },
]

const DEFAULT_FIELDS = {
  americas: { stockClass: 'MTS', mroq: false, shipFrom: 'domestic' },
  europe: { stockClass: 'MTS', freightPct: 3.5, dutyPct: 2.2 },
  china: { supplierSource: 'jde', countryOfOrigin: 'us', applyLocalMarkups: true },
  india: { supplierType: 'local' },
}

function ToggleGroup({ options, value, onChange }) {
  return (
    <div className="toggle-group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`toggle-btn ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function RegionFields({ region, fields, onChange }) {
  const set = (key, value) => onChange({ ...fields, [key]: value })

  if (region === 'americas') {
    return (
      <>
        <div className="field">
          <label>Stock Class</label>
          <ToggleGroup
            options={[{ value: 'MTS', label: 'MTS' }, { value: 'NONMTS', label: 'Non-MTS' }]}
            value={fields.stockClass}
            onChange={(v) => set('stockClass', v)}
          />
        </div>
        <div className="field">
          <label>MROQ Present</label>
          <ToggleGroup
            options={[{ value: true, label: 'Yes' }, { value: false, label: 'No' }]}
            value={fields.mroq}
            onChange={(v) => set('mroq', v)}
          />
        </div>
        <div className="field">
          <label>Ship-From</label>
          <ToggleGroup
            options={[{ value: 'domestic', label: 'Domestic' }, { value: 'overseas', label: 'Overseas' }]}
            value={fields.shipFrom}
            onChange={(v) => set('shipFrom', v)}
          />
        </div>
      </>
    )
  }

  if (region === 'europe') {
    return (
      <>
        <div className="field">
          <label>Stock Class</label>
          <ToggleGroup
            options={[{ value: 'MTS', label: 'MTS' }, { value: 'NONMTS', label: 'Non-MTS' }]}
            value={fields.stockClass}
            onChange={(v) => set('stockClass', v)}
          />
        </div>
        {fields.stockClass === 'NONMTS' && (
          <div className="field">
            <label>Freight / Duty % (Non-MTS only)</label>
            <div className="field-row">
              <input
                type="number"
                step="0.1"
                value={fields.freightPct}
                placeholder="Freight %"
                onChange={(e) => set('freightPct', e.target.value)}
              />
              <input
                type="number"
                step="0.1"
                value={fields.dutyPct}
                placeholder="Duty %"
                onChange={(e) => set('dutyPct', e.target.value)}
              />
            </div>
          </div>
        )}
      </>
    )
  }

  if (region === 'china') {
    return (
      <>
        <div className="field">
          <label>Supplier Source</label>
          <ToggleGroup
            options={[{ value: 'jde', label: 'JDE China Direct' }, { value: 'sap', label: 'SAP Europe Fallback' }]}
            value={fields.supplierSource}
            onChange={(v) => set('supplierSource', v)}
          />
        </div>
        {fields.supplierSource === 'sap' && (
          <div className="field">
            <label>Country of Origin</label>
            <ToggleGroup
              options={[{ value: 'us', label: 'COO = US' }, { value: 'other', label: 'COO ≠ US' }]}
              value={fields.countryOfOrigin}
              onChange={(v) => set('countryOfOrigin', v)}
            />
          </div>
        )}
        <div className="field">
          <label>Apply Local Markups</label>
          <ToggleGroup
            options={[{ value: true, label: 'LCE 6% + LCS 3.2%' }, { value: false, label: 'None' }]}
            value={fields.applyLocalMarkups}
            onChange={(v) => set('applyLocalMarkups', v)}
          />
        </div>
      </>
    )
  }

  // india
  return (
    <div className="field">
      <label>Supplier Type</label>
      <ToggleGroup
        options={[{ value: 'local', label: 'Local' }, { value: 'overseas', label: 'Overseas' }]}
        value={fields.supplierType}
        onChange={(v) => set('supplierType', v)}
      />
    </div>
  )
}

function App() {
  const [authHeader, setAuthHeader] = useState(undefined) // undefined = still checking, null = not signed in
  const [region, setRegion] = useState('americas')
  const [partNumber, setPartNumber] = useState('4501234567')
  const [quantity, setQuantity] = useState(100)
  const [baseCost, setBaseCost] = useState('')
  const [fieldsByRegion, setFieldsByRegion] = useState(DEFAULT_FIELDS)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!stored) {
      setAuthHeader(null)
      return
    }
    fetch(`${API_BASE}/Simulations?$top=1`, { headers: { Authorization: stored } })
      .then((res) => {
        if (res.ok) setAuthHeader(stored)
        else {
          sessionStorage.removeItem(AUTH_STORAGE_KEY)
          setAuthHeader(null)
        }
      })
      .catch(() => setAuthHeader(null))
  }, [])

  function signOut() {
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
    setAuthHeader(null)
  }

  const fields = fieldsByRegion[region]

  function selectRegion(r) {
    setRegion(r)
    setResult(null)
  }

  async function calculate() {
    setLoading(true)
    setResult(null)
    try {
      const body = {
        region,
        partNumber,
        quantity: Number(quantity) || 1,
        baseCost: baseCost === '' ? null : Number(baseCost),
        stockClass: fields.stockClass ?? null,
        mroq: fields.mroq ?? null,
        shipFrom: fields.shipFrom ?? null,
        freightPct: fields.freightPct != null ? Number(fields.freightPct) : null,
        dutyPct: fields.dutyPct != null ? Number(fields.dutyPct) : null,
        supplierSource: fields.supplierSource ?? null,
        countryOfOrigin: fields.countryOfOrigin ?? null,
        applyLocalMarkups: fields.applyLocalMarkups ?? null,
        supplierType: fields.supplierType ?? null,
      }
      const res = await fetch(`${API_BASE}/calculatePrice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setResult(res.ok ? data : { error: data.error?.message || 'Request failed' })
    } catch {
      setResult({ error: 'Could not reach the pricing service.' })
    } finally {
      setLoading(false)
    }
  }

  if (authHeader === undefined) return null
  if (authHeader === null) return <Login onSuccess={setAuthHeader} />

  return (
    <main className="app">
      <header className="app-header">
        <div className="app-header-row">
          <h1>Regional Pricing Simulation</h1>
          <button type="button" className="sign-out-btn" onClick={signOut}>Sign out</button>
        </div>
        <p className="subtitle">
          Runs the real regional pricing engine (see calculatePrice). Leave Base Cost blank to look it up live
          via ERP / BI Central Cost DB through API6.
        </p>
      </header>

      <div className="wrap">
        <section className="panel">
          <div className="panel-head">
            <h2>Request Input</h2>
          </div>
          <div className="region-tabs">
            {REGIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`region-tab ${region === r.key ? 'active' : ''}`}
                onClick={() => selectRegion(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="panel-body">
            <div className="field">
              <label>Part Number</label>
              <input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Quantity</label>
                <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="field">
                <label>Base Cost (unit) — optional</label>
                <input
                  type="number"
                  step="0.01"
                  value={baseCost}
                  placeholder="blank = look up via API6"
                  onChange={(e) => setBaseCost(e.target.value)}
                />
              </div>
            </div>

            <RegionFields region={region} fields={fields} onChange={(f) => setFieldsByRegion((prev) => ({ ...prev, [region]: f }))} />

            <button type="button" className="calc-btn" onClick={calculate} disabled={loading}>
              {loading ? 'Calculating…' : 'Calculate Price'}
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Pricing Result</h2>
          </div>

          {!result && (
            <div className="empty-state">
              <div className="glyph">$</div>
              <h3>No Calculation Yet</h3>
              <p>Fill in the part details on the left and hit Calculate Price to run it through the regional pricing engine.</p>
            </div>
          )}

          {result?.error && (
            <div className="alert-box show">
              <div className="alert-title">⚠ {result.error}</div>
            </div>
          )}

          {result && !result.error && (
            <>
              <div className="result-hero show">
                <div className="scenario-tag">{result.scenario}</div>
                <div className="price-line">
                  <div className="price">{result.unitPrice?.toFixed(2)}</div>
                  <div className="price-unit">per unit</div>
                </div>
                <div className="price-sub">
                  Part {partNumber} · Qty {quantity} · Total line value {result.totalPrice?.toFixed(2)}
                </div>
              </div>

              <div className="breakdown show">
                <h4>Cost Breakdown</h4>
                {result.breakdown?.map((row, i) => (
                  <div className="bd-row" key={i}>
                    <span className="lbl">{row.label}</span>
                    <span className="val">{Number(row.value).toFixed(2)}</span>
                  </div>
                ))}
                <div className="bd-row total">
                  <span className="lbl">Unit Price</span>
                  <span className="val">{result.unitPrice?.toFixed(2)}</span>
                </div>
              </div>

              <div className="meta-strip show">
                <div className="meta-item">
                  Region
                  <b>{region}</b>
                </div>
                <div className="meta-item">
                  Cost Source
                  <b>{result.costSource}</b>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

export default App
