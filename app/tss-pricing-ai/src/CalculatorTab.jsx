import { useState } from 'react'
import ExcelJS from 'exceljs'
import {
  Plus, Upload, Download, Sparkles, Database, CloudCog, Trash2,
  ChevronDown, BookOpenText, Layers, Wallet, AlertTriangle, CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react'
import { calculatePrices, fetchCostFromERP, fetchCostFromBI } from './api.js'
import { REGIONS, DEFAULT_CURRENCY, defaultFieldsFor, newLineItem, EXCEL_COLUMNS, FORMULA_REFERENCE } from './fields.js'

function Segmented({ options, value, onChange, block }) {
  return (
    <div className={`segmented ${block ? 'block' : ''}`}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          className={`segmented-btn ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

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

function optionsSummary(item) {
  switch (item.region) {
    case 'americas':
      return `${item.stockClass} · MROQ ${item.mroq ? 'Yes' : 'No'} · ${item.shipFrom === 'overseas' ? 'Overseas' : 'Domestic'}`
    case 'europe':
      return item.stockClass === 'NONMTS'
        ? `Non-MTS · Freight ${item.freightPct ?? 0}% · Duty ${item.dutyPct ?? 0}%`
        : 'MTS'
    case 'china':
      return `${item.supplierSource === 'sap' ? 'SAP Europe Fallback' : 'JDE China Direct'}${item.supplierSource === 'sap' ? ` · COO ${item.countryOfOrigin === 'us' ? '= US' : '≠ US'}` : ''} · ${item.applyLocalMarkups ? 'Local markups on' : 'No local markups'}`
    default:
      return item.supplierType === 'overseas' ? 'Overseas supplier' : 'Local supplier'
  }
}

function LineItemCard({ index, item, result, onChange, onRemove, canRemove, authHeader }) {
  const [fetching, setFetching] = useState(false)
  const [showOptions, setShowOptions] = useState(false)

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
      <div className="line-item-head">
        <Segmented options={REGIONS.map((r) => ({ value: r.key, label: r.label }))} value={item.region} onChange={selectRegion} />
        {canRemove && (
          <button type="button" className="btn btn-danger-ghost btn-icon" onClick={onRemove} title={`Remove item ${index + 1}`}>
            <Trash2 />
          </button>
        )}
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
          <button type="button" className="btn" disabled={fetching} onClick={() => fetchCost('erp')}><Database /> Fetch from ERP</button>
          <button type="button" className="btn" disabled={fetching} onClick={() => fetchCost('bi')}><CloudCog /> Fetch from BI Central Cost DB</button>
        </div>

        <div className="options-block">
          <button type="button" className={`options-toggle ${showOptions ? 'open' : ''}`} onClick={() => setShowOptions((v) => !v)}>
            <SlidersHorizontal />
            <span className="options-toggle-label">Options</span>
            {!showOptions && <span className="options-summary">{optionsSummary(item)}</span>}
            <ChevronDown className="chev" />
          </button>
          {showOptions && (
            <div className="options-grid">
              <RegionFields item={item} onChange={onChange} />
            </div>
          )}
        </div>

        {result?.error && (
          <div className="alert-box show">
            <AlertTriangle />
            <div className="alert-title">{result.error}</div>
          </div>
        )}

        {result && !result.error && (
          <div className="line-item-result">
            <span className="scenario-tag"><CheckCircle2 style={{ width: 12, height: 12, marginRight: 4, verticalAlign: -2 }} />{result.scenario}</span>
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

  const resultList = Object.values(results)
  const priced = resultList.filter((r) => r && !r.error)
  const grandTotal = priced.reduce((sum, r) => sum + (r.totalPrice || 0), 0)
  const currencies = [...new Set(priced.map((r) => r.currency).filter(Boolean))]
  // Line items can span regions with different currencies (USD/EUR/CNY/INR);
  // summing across them without conversion is only meaningful when they
  // match, so flag it plainly rather than label a mixed sum with one currency.
  const grandTotalLabel = currencies.length === 1 ? currencies[0] : currencies.length > 1 ? 'Mixed currencies' : ''

  return (
    <div className="calc-layout">
      <div className="calc-main">
        <div className="toolbar">
          <button type="button" className="btn" onClick={addItem}><Plus /> Add item</button>
          <label className="btn upload-btn">
            <Upload /> Upload Excel
            <input type="file" accept=".xlsx" onChange={handleUpload} hidden />
          </label>
          <button type="button" className="btn" onClick={downloadTemplate}><Download /> Download template</button>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={calculateAll} disabled={loading}>
            <Sparkles /> {loading ? 'Calculating…' : `Calculate All (${items.length})`}
          </button>
        </div>

        {items.map((item, i) => (
          <LineItemCard
            key={item.lineId}
            index={i}
            item={item}
            result={results[item.lineId]}
            onChange={(next) => updateItem(item.lineId, next)}
            onRemove={() => removeItem(item.lineId)}
            canRemove={items.length > 1}
            authHeader={authHeader}
          />
        ))}
      </div>

      <aside className="calc-side">
        <div className="card summary-card">
          <h3>Summary</h3>
          {resultList.length ? (
            <>
              <div className="summary-row"><span><Layers style={{ width: 13, height: 13, verticalAlign: -2, marginRight: 5 }} />Items priced</span><span>{priced.length} / {items.length}</span></div>
              <div className="summary-row total"><span><Wallet style={{ width: 15, height: 15, verticalAlign: -2, marginRight: 5 }} />Grand total</span><span>{grandTotalLabel} {grandTotal.toFixed(2)}</span></div>
              {currencies.length > 1 && <p className="summary-empty">Sum spans {currencies.join(', ')} without conversion — see line items for currency-accurate totals.</p>}
            </>
          ) : (
            <p className="summary-empty">Run "Calculate All" to see pricing totals here.</p>
          )}
        </div>

        <div className="card formula-card">
          <button type="button" className={`formula-toggle ${showFormulas ? 'open' : ''}`} onClick={() => setShowFormulas((v) => !v)}>
            <BookOpenText /> How is this calculated?
            <ChevronDown className="chev" />
          </button>
          {showFormulas && (
            <div className="formula-body">
              <Segmented block options={REGIONS.map((r) => ({ value: r.key, label: r.label }))} value={formulaRegion} onChange={setFormulaRegion} />
              <ul className="formula-list">
                {FORMULA_REFERENCE[formulaRegion].map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
