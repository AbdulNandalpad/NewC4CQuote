import { useState } from 'react'
import ExcelJS from 'exceljs'
import { calculatePrices, fetchCostFromERP, fetchCostFromBI } from './api.js'
import { REGIONS, DEFAULT_CURRENCY, defaultFieldsFor, newLineItem, EXCEL_COLUMNS, FORMULA_REFERENCE } from './fields.js'

function ToggleGroup({ options, value, onChange }) {
  return (
    <div className="toggle-group">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
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

function RegionFields({ item, onChange }) {
  const set = (key, value) => onChange({ ...item, [key]: value })

  if (item.region === 'americas') {
    return (
      <>
        <div className="field">
          <label>Stock Class</label>
          <ToggleGroup options={[{ value: 'MTS', label: 'MTS' }, { value: 'NONMTS', label: 'Non-MTS' }]} value={item.stockClass} onChange={(v) => set('stockClass', v)} />
        </div>
        <div className="field">
          <label>MROQ</label>
          <ToggleGroup options={[{ value: true, label: 'Yes' }, { value: false, label: 'No' }]} value={item.mroq} onChange={(v) => set('mroq', v)} />
        </div>
        <div className="field">
          <label>Ship-From</label>
          <ToggleGroup options={[{ value: 'domestic', label: 'Domestic' }, { value: 'overseas', label: 'Overseas' }]} value={item.shipFrom} onChange={(v) => set('shipFrom', v)} />
        </div>
      </>
    )
  }

  if (item.region === 'europe') {
    return (
      <>
        <div className="field">
          <label>Stock Class</label>
          <ToggleGroup options={[{ value: 'MTS', label: 'MTS' }, { value: 'NONMTS', label: 'Non-MTS' }]} value={item.stockClass} onChange={(v) => set('stockClass', v)} />
        </div>
        {item.stockClass === 'NONMTS' && (
          <div className="field-row">
            <div className="field">
              <label>Freight %</label>
              <input type="number" step="0.1" value={item.freightPct ?? ''} onChange={(e) => set('freightPct', e.target.value)} />
            </div>
            <div className="field">
              <label>Duty %</label>
              <input type="number" step="0.1" value={item.dutyPct ?? ''} onChange={(e) => set('dutyPct', e.target.value)} />
            </div>
          </div>
        )}
      </>
    )
  }

  if (item.region === 'china') {
    return (
      <>
        <div className="field">
          <label>Supplier Source</label>
          <ToggleGroup options={[{ value: 'jde', label: 'JDE China Direct' }, { value: 'sap', label: 'SAP Europe Fallback' }]} value={item.supplierSource} onChange={(v) => set('supplierSource', v)} />
        </div>
        {item.supplierSource === 'sap' && (
          <div className="field">
            <label>Country of Origin</label>
            <ToggleGroup options={[{ value: 'us', label: 'COO = US' }, { value: 'other', label: 'COO ≠ US' }]} value={item.countryOfOrigin} onChange={(v) => set('countryOfOrigin', v)} />
          </div>
        )}
        <div className="field">
          <label>Apply Local Markups</label>
          <ToggleGroup options={[{ value: true, label: 'LCE 6% + LCS 3.2%' }, { value: false, label: 'None' }]} value={item.applyLocalMarkups} onChange={(v) => set('applyLocalMarkups', v)} />
        </div>
      </>
    )
  }

  return (
    <div className="field">
      <label>Supplier Type</label>
      <ToggleGroup options={[{ value: 'local', label: 'Local' }, { value: 'overseas', label: 'Overseas' }]} value={item.supplierType} onChange={(v) => set('supplierType', v)} />
    </div>
  )
}

function LineItemCard({ item, result, onChange, onRemove, canRemove, authHeader }) {
  const [fetching, setFetching] = useState(false)

  function selectRegion(region) {
    // Currency follows the region's default on switch — if a user wants a
    // different currency for that region, they can edit it afterward, but
    // switching region shouldn't leave a stale currency from the last one.
    onChange({ ...item, region, currency: DEFAULT_CURRENCY[region], ...defaultFieldsFor(region) })
  }

  async function fetchCost(source) {
    setFetching(true)
    try {
      const looked = source === 'erp' ? await fetchCostFromERP(authHeader, item.region, item.partNumber) : await fetchCostFromBI(authHeader, item.region, item.partNumber)
      if (looked.baseCost != null) onChange({ ...item, baseCost: looked.baseCost })
      else window.alert(looked.error || 'Cost not found.')
    } catch (err) {
      window.alert(err.message)
    } finally {
      setFetching(false)
    }
  }

  return (
    <div className="line-item-card">
      <div className="region-tabs">
        {REGIONS.map((r) => (
          <button key={r.key} type="button" className={`region-tab ${item.region === r.key ? 'active' : ''}`} onClick={() => selectRegion(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="line-item-body">
        <div className="field-row wide">
          <div className="field">
            <label>Part Number</label>
            <input value={item.partNumber} onChange={(e) => onChange({ ...item, partNumber: e.target.value })} />
          </div>
          <div className="field">
            <label>Quantity</label>
            <input type="number" min="1" value={item.quantity} onChange={(e) => onChange({ ...item, quantity: e.target.value })} />
          </div>
          <div className="field">
            <label>Base Cost</label>
            <input type="number" step="0.01" placeholder="blank = fetch" value={item.baseCost} onChange={(e) => onChange({ ...item, baseCost: e.target.value })} />
          </div>
          <div className="field">
            <label>Currency</label>
            <input value={item.currency} maxLength={3} onChange={(e) => onChange({ ...item, currency: e.target.value.toUpperCase() })} />
          </div>
        </div>

        <div className="fetch-buttons">
          <button type="button" disabled={fetching} onClick={() => fetchCost('erp')}>Fetch from ERP</button>
          <button type="button" disabled={fetching} onClick={() => fetchCost('bi')}>Fetch from BI Central Cost DB</button>
          {canRemove && <button type="button" className="remove-btn" onClick={onRemove}>Remove item</button>}
        </div>

        <RegionFields item={item} onChange={onChange} />

        {result?.error && (
          <div className="alert-box show"><div className="alert-title">⚠ {result.error}</div></div>
        )}

        {result && !result.error && (
          <div className="line-item-result">
            <span className="scenario-tag">{result.scenario}</span>
            <span className="result-price">{result.currency} {result.unitPrice?.toFixed(2)} <span className="result-unit">/ unit</span></span>
            <span className="result-total">Total: {result.currency} {result.totalPrice?.toFixed(2)}</span>
            <span className="result-source">Cost source: {result.costSource}</span>
            <details className="breakdown-details">
              <summary>Cost breakdown</summary>
              {result.breakdown?.map((row, i) => (
                <div className="bd-row" key={i}><span className="lbl">{row.label}</span><span className="val">{Number(row.value).toFixed(2)}</span></div>
              ))}
            </details>
          </div>
        )}
      </div>
    </div>
  )
}

function toRow(item) {
  const row = {}
  for (const col of EXCEL_COLUMNS) row[col] = item[col] ?? ''
  return row
}

function fromRow(row) {
  const item = newLineItem(row.region || 'americas')
  for (const col of EXCEL_COLUMNS) {
    if (row[col] === undefined || row[col] === null || row[col] === '') continue
    if (col === 'mroq' || col === 'applyLocalMarkups') item[col] = String(row[col]).toLowerCase() === 'true' || row[col] === true
    else item[col] = row[col]
  }
  return item
}

async function downloadTemplate() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Items')
  ws.columns = EXCEL_COLUMNS.map((key) => ({ header: key, key }))
  ws.addRow(toRow({ ...newLineItem('americas'), partNumber: '4501234567', baseCost: 12.5 }))
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'tss-pricing-ai-template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

export default function CalculatorTab({ authHeader }) {
  const [items, setItems] = useState([newLineItem()])
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState(false)
  const [showFormulas, setShowFormulas] = useState(false)
  const [formulaRegion, setFormulaRegion] = useState('americas')

  function updateItem(lineId, next) {
    setItems((prev) => prev.map((it) => (it.lineId === lineId ? next : it)))
  }
  function removeItem(lineId) {
    setItems((prev) => prev.filter((it) => it.lineId !== lineId))
    setResults((prev) => { const { [lineId]: _drop, ...rest } = prev; return rest })
  }
  function addItem() {
    setItems((prev) => [...prev, newLineItem()])
  }

  async function calculateAll() {
    setLoading(true)
    try {
      const payload = items.map((it) => ({ ...it, quantity: Number(it.quantity) || 1, baseCost: it.baseCost === '' ? null : Number(it.baseCost) }))
      const rows = await calculatePrices(authHeader, payload)
      const byId = {}
      for (const row of rows) byId[row.lineId] = row
      setResults(byId)
    } catch (err) {
      window.alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    const header = ws.getRow(1).values.slice(1).map(String)
    const rows = []
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const values = row.values.slice(1)
      const obj = {}
      header.forEach((col, i) => { obj[col] = values[i] })
      rows.push(obj)
    })
    setItems(rows.map(fromRow))
    setResults({})
  }

  const grandTotal = Object.values(results).reduce((sum, r) => sum + (r?.totalPrice || 0), 0)

  return (
    <div className="calculator-tab">
      <section className="panel formula-panel">
        <button type="button" className="formula-toggle" onClick={() => setShowFormulas((v) => !v)}>
          {showFormulas ? '▾' : '▸'} How is this calculated?
        </button>
        {showFormulas && (
          <div className="formula-body">
            <div className="region-tabs">
              {REGIONS.map((r) => (
                <button key={r.key} type="button" className={`region-tab ${formulaRegion === r.key ? 'active' : ''}`} onClick={() => setFormulaRegion(r.key)}>
                  {r.label}
                </button>
              ))}
            </div>
            <ul className="formula-list">
              {FORMULA_REFERENCE[formulaRegion].map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>
        )}
      </section>

      <div className="toolbar">
        <button type="button" onClick={addItem}>+ Add item</button>
        <label className="upload-btn">
          Upload Excel
          <input type="file" accept=".xlsx" onChange={handleUpload} hidden />
        </label>
        <button type="button" onClick={downloadTemplate}>Download template</button>
        <button type="button" className="calc-btn" onClick={calculateAll} disabled={loading}>
          {loading ? 'Calculating…' : `Calculate All (${items.length})`}
        </button>
      </div>

      {items.map((item) => (
        <LineItemCard
          key={item.lineId}
          item={item}
          result={results[item.lineId]}
          onChange={(next) => updateItem(item.lineId, next)}
          onRemove={() => removeItem(item.lineId)}
          canRemove={items.length > 1}
          authHeader={authHeader}
        />
      ))}

      {Object.keys(results).length > 0 && (
        <div className="grand-total">Grand total (all items): {grandTotal.toFixed(2)}</div>
      )}
    </div>
  )
}
