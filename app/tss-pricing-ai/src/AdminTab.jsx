import { useEffect, useState } from 'react'
import { SlidersHorizontal, Save } from 'lucide-react'
import { listRateConfig, updateRateConfig } from './api.js'
import { REGIONS } from './fields.js'

export default function AdminTab({ authHeader }) {
  const [rows, setRows] = useState(null)
  const [dirty, setDirty] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    listRateConfig(authHeader).then(setRows).catch((err) => setMessage(err.message))
  }, [authHeader])

  function setValue(id, value) {
    setDirty((prev) => ({ ...prev, [id]: value }))
  }

  async function saveAll() {
    setSaving(true)
    setMessage('')
    try {
      await Promise.all(Object.entries(dirty).map(([id, value]) => updateRateConfig(authHeader, id, Number(value))))
      const fresh = await listRateConfig(authHeader)
      setRows(fresh)
      setDirty({})
      setMessage('Saved.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!rows) return <div className="card admin-tab" style={{ padding: 18 }}><p>{message || 'Loading rate configuration…'}</p></div>

  return (
    <div className="admin-tab">
      <p className="subtitle">
        These rates drive the calculation formulas (see the "How is this calculated?" panel on the Calculator tab).
        Changes apply immediately to all future calculations.
      </p>
      <div className="admin-grid">
        {REGIONS.map((region) => {
          const regionRows = rows.filter((r) => r.region === region.key)
          if (!regionRows.length) return null
          return (
            <section className="card admin-region" key={region.key}>
              <div className="panel-head"><SlidersHorizontal /><h2>{region.label}</h2></div>
              <table className="admin-table">
                <thead>
                  <tr><th>Rate</th><th>Value</th><th>Unit</th></tr>
                </thead>
                <tbody>
                  {regionRows.map((row) => (
                    <tr key={row.ID}>
                      <td>{row.label}</td>
                      <td>
                        <input
                          type="number"
                          step="0.0001"
                          value={dirty[row.ID] ?? row.value}
                          onChange={(e) => setValue(row.ID, e.target.value)}
                        />
                      </td>
                      <td className="unit-cell">{row.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )
        })}
      </div>
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={saveAll} disabled={saving || !Object.keys(dirty).length}>
          <Save /> {saving ? 'Saving…' : 'Save changes'}
        </button>
        {message && <span className="admin-message">{message}</span>}
      </div>
    </div>
  )
}
