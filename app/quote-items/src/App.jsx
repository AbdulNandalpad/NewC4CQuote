import { useEffect, useState } from 'react'
import './App.css'

const API_BASE = `${window.__CONFIG__?.apiOrigin || ''}/quote-items`

// C4C passes context (e.g. the quote ID) into a URL Mashup as query
// parameters bound to the screen's business object fields. This reads
// that binding the same way C4C would set it, e.g.
//   https://<app-host>/?quoteId=#{HeaderInfo.UUID}
function useQuoteIdFromUrl() {
  const [quoteId] = useState(() => new URLSearchParams(window.location.search).get('quoteId') || '')
  return quoteId
}

function App() {
  const quoteId = useQuoteIdFromUrl()
  const [status, setStatus] = useState('checking')
  const [items, setItems] = useState([])

  useEffect(() => {
    const filter = quoteId ? `?$filter=c4cQuoteId eq '${encodeURIComponent(quoteId)}'` : ''
    fetch(`${API_BASE}/Items${filter}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((body) => {
        setItems(body.value || [])
        setStatus('connected')
      })
      .catch(() => setStatus('error'))
  }, [quoteId])

  return (
    <main className="app">
      <header>
        <h1>Quote Items</h1>
        <p className={`status status-${status}`}>
          CAP service ({API_BASE}): {status}
        </p>
        <p className="context">
          C4C quote context (quoteId param): <code>{quoteId || '(none — opened outside a C4C mashup)'}</code>
        </p>
      </header>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Product</th>
            <th>Description</th>
            <th>Qty</th>
            <th>List Price</th>
            <th>Net Price</th>
            <th>Currency</th>
            <th>AI Suggested</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={8}>No items for this quote yet.</td>
            </tr>
          )}
          {items.map((item) => (
            <tr key={item.ID}>
              <td>{item.c4cItemId}</td>
              <td>{item.product}</td>
              <td>{item.productDesc}</td>
              <td>{item.quantity}</td>
              <td>{item.listPrice}</td>
              <td>{item.netPrice}</td>
              <td>{item.currency}</td>
              <td>{item.aiSuggested ? 'Yes' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}

export default App
