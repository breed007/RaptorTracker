import React, { useState } from 'react'
import { useApp } from '../context/AppContext'

// The same bolt mark as the home-screen icon, favicon, and landing page, so
// the first screen a new owner sees matches the icon they tapped.
function BoltMark() {
  return (
    <svg viewBox="0 0 512 512" className="w-12 h-12" aria-hidden="true">
      <path d="M288 96 160 288h88l-24 128 128-192h-88z" fill="#FF6B00" />
    </svg>
  )
}

export default function Login() {
  const { setUser } = useApp()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (res.ok) {
        const me = await fetch('/api/auth/me').then(r => r.json())
        setUser(me)
      } else {
        const data = await res.json()
        setError(data.error || 'Login failed')
      }
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-raptor-base flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm flex-1 flex flex-col items-center justify-center">
        {/* Logo + wordmark */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
            style={{ backgroundColor: '#0f172a' }}
          >
            <BoltMark />
          </div>
          <h1 className="font-display font-bold text-4xl text-raptor-primary tracking-wide">RaptorTracker</h1>
          <p className="text-raptor-muted text-sm mt-1">Ford Raptor Build Tracker</p>
        </div>

        <div className="card p-6 shadow-sm w-full">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="login-username">Username</label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input-field"
                required
                autoComplete="username"
                autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-field"
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="text-red-600 text-sm bg-red-50 border border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-900 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>

      <footer className="py-4 w-full flex items-center justify-between gap-4 max-w-sm">
        <p className="text-xs text-raptor-muted">© 2026 breed007 · MIT licensed</p>
        <a
          href="https://github.com/breed007/RaptorTracker"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-raptor-muted hover:text-raptor-accent transition-colors flex-shrink-0"
        >
          v{__APP_VERSION__}
        </a>
      </footer>
    </div>
  )
}
