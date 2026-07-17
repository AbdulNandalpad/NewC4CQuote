import { useEffect, useState } from 'react'
import './App.css'

const API_BASE = `${window.__CONFIG__?.apiOrigin || ''}/pricing`

function computeNet(item) {
  const qty = Number(item.quantity) || 0
  const list = Number(item.listPrice) || 0
  const discount = Number(item.discountPct) || 0
  return +(qty * list * (1 - discount / 100)).toFixed(2)
}

function App() {
  const [status, setStatus] = useState('checking')
  const [items, setItems] = useState([
    { product: '', productDesc: '', quantity: 1, listPrice: 0, discountPct: 0 },
  ])

  useEffect(() => {
    fetch(`${API_BASE}/Simulations?$top=1`)
      .then((res) => setStatus(res.ok ? 'connected' : 'error'))
      .catch(() => setStatus('error'))
  }, [])

  function updateItem(index, field, value) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)),
    )
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { product: '', productDesc: '', quantity: 1, listPrice: 0, discountPct: 0 },
    ])
  }

  const total = items.reduce((sum, it) => sum + computeNet(it), 0)

  return (
    <main className="app">
      <header>
        <h1>Pricing Simulation</h1>
        <p className={`status status-${status}`}>
          CAP service ({API_BASE}): {status}
        </p>
      </header>

      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Description</th>
            <th>Qty</th>
            <th>List Price</th>
            <th>Discount %</th>
            <th>Net Price</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td>
                <input value={item.product} onChange={(e) => updateItem(i, 'product', e.target.value)} />
              </td>
              <td>
                <input value={item.productDesc} onChange={(e) => updateItem(i, 'productDesc', e.target.value)} />
              </td>
              <td>
                <input type="number" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', e.target.value)} />
              </td>
              <td>
                <input type="number" value={item.listPrice} onChange={(e) => updateItem(i, 'listPrice', e.target.value)} />
              </td>
              <td>
                <input type="number" value={item.discountPct} onChange={(e) => updateItem(i, 'discountPct', e.target.value)} />
              </td>
              <td>{computeNet(item)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" onClick={addItem}>+ Add line item</button>
      <p className="total">Simulated total: {total.toFixed(2)}</p>
    </main>
  )
}

export default App
