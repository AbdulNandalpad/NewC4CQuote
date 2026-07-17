import { useEffect, useState } from 'react'
import './App.css'
import { checkLogin, API_BASE } from './api.js'
import CalculatorTab from './CalculatorTab.jsx'
import AdminTab from './AdminTab.jsx'

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
      const res = await checkLogin(authHeader)
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
        <img className="logo" src="/trelleborg-logo.svg" alt="Trelleborg" />
        <h1>TSS Pricing AI</h1>
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

function App() {
  const [authHeader, setAuthHeader] = useState(undefined) // undefined = still checking, null = not signed in
  const [tab, setTab] = useState('calculator')

  useEffect(() => {
    const stored = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!stored) {
      setAuthHeader(null)
      return
    }
    checkLogin(stored)
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

  if (authHeader === undefined) return null
  if (authHeader === null) return <Login onSuccess={setAuthHeader} />

  return (
    <main className="app">
      <header className="app-header">
        <div className="app-header-row">
          <div className="brand">
            <img className="logo" src="/trelleborg-logo.svg" alt="Trelleborg" />
            <h1>TSS Pricing AI</h1>
          </div>
          <button type="button" className="sign-out-btn" onClick={signOut}>Sign out</button>
        </div>
        <nav className="main-tabs">
          <button type="button" className={`main-tab ${tab === 'calculator' ? 'active' : ''}`} onClick={() => setTab('calculator')}>Calculator</button>
          <button type="button" className={`main-tab ${tab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>Admin: Rate Config</button>
        </nav>
      </header>

      {tab === 'calculator' ? <CalculatorTab authHeader={authHeader} /> : <AdminTab authHeader={authHeader} />}

      <footer className="app-footer">API: {API_BASE}</footer>
    </main>
  )
}

export default App
