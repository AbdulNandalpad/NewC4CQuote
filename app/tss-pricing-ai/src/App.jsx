import { useEffect, useState } from 'react'
import './App.css'
import { Calculator, LogOut, Lock, SlidersHorizontal } from 'lucide-react'
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
    <main className="app login-shell">
      <div className="login-box">
        <img className="logo" src="/trelleborg-logo.svg" alt="Trelleborg" />
        <h1>TSS Pricing AI</h1>
        <p className="subtitle">Regional pricing intelligence for Trelleborg Sealing Solutions</p>
        <form onSubmit={submit}>
          <div className="login-lock-icon"><Lock /></div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus placeholder={`Sign in as ${ADMIN_EMAIL}`} />
          </div>
          <button type="submit" className="calc-btn" disabled={checking}>
            {checking ? 'Checking…' : 'Sign In'}
          </button>
          {error && (
            <div className="alert-box show">
              <div className="alert-title">{error}</div>
            </div>
          )}
        </form>
      </div>
    </main>
  )
}

function initialsOf(email) {
  const name = email.split('@')[0] || ''
  const parts = name.split(/[.\-_]/).filter(Boolean)
  const chars = parts.length > 1 ? [parts[0][0], parts[1][0]] : [name[0], name[1]]
  return chars.filter(Boolean).join('').toUpperCase()
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
    <div className="app shell">
      <aside className="rail">
        <div className="rail-brand">
          <img src="/trelleborg-logo.svg" alt="Trelleborg" />
          <div className="rail-brand-text">
            <strong>TSS Pricing AI</strong>
            <span>Sealing Solutions</span>
          </div>
        </div>

        <nav className="rail-nav">
          <button type="button" className={`rail-btn ${tab === 'calculator' ? 'active' : ''}`} onClick={() => setTab('calculator')}>
            <Calculator /> Calculator
          </button>
          <button type="button" className={`rail-btn ${tab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>
            <SlidersHorizontal /> Rate Config
          </button>
        </nav>

        <div className="rail-footer">
          <div className="rail-avatar">{initialsOf(ADMIN_EMAIL)}</div>
          <span className="rail-user-email" title={ADMIN_EMAIL}>{ADMIN_EMAIL}</span>
          <button type="button" className="rail-signout" onClick={signOut} title="Sign out">
            <LogOut />
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <h1>{tab === 'calculator' ? 'Pricing Calculator' : 'Rate Configuration'}</h1>
          <span className="topbar-sub">· {API_BASE}</span>
        </header>
        <div className="shell-content">
          {tab === 'calculator' ? <CalculatorTab authHeader={authHeader} /> : <AdminTab authHeader={authHeader} />}
        </div>
      </div>
    </div>
  )
}

export default App
