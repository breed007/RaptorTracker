import React, { useState } from 'react'
import { useApp } from '../context/AppContext'

function RaptorTruckLogo() {
  return (
    <svg
      viewBox="0 0 80 50"
      fill="currentColor"
      className="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Truck body */}
      <path d="M2 44 L2 31 Q2 27 6 25 L27 25 L27 10 Q27 7 31 6 L54 6 Q58 6 61 10 L68 22 L73 24 Q77 24 78 28 L78 44 Z" />
      {/* Cab window */}
      <path d="M32 9 L32 22 L62 22 L57 11 Q56 9 54 9 Z" fill="rgba(255,255,255,0.18)" />
      {/* Bed divider line */}
      <line x1="27" y1="25" x2="27" y2="44" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      {/* Front wheel */}
      <circle cx="15" cy="41" r="10" fill="currentColor" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <circle cx="15" cy="41" r="6" fill="rgba(0,0,0,0.3)" />
      <circle cx="15" cy="41" r="2.5" fill="rgba(255,255,255,0.25)" />
      {/* Rear wheel */}
      <circle cx="64" cy="41" r="10" fill="currentColor" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <circle cx="64" cy="41" r="6" fill="rgba(0,0,0,0.3)" />
      <circle cx="64" cy="41" r="2.5" fill="rgba(255,255,255,0.25)" />
      {/* Front bumper / light */}
      <rect x="76" y="30" width="3" height="6" rx="1" fill="rgba(255,255,255,0.6)" />
      {/* Exhaust */}
      <rect x="2" y="28" width="1.5" height="4" rx="0.5" fill="rgba(255,255,255,0.3)" />
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
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 text-white"
            style={{ backgroundColor: 'var(--rl-sidebar-bg)' }}
          >
            <div className="w-14 h-10">
              <RaptorTruckLogo />
            </div>
          </div>
          <h1 className="font-display font-bold text-4xl text-raptor-primary tracking-wide">RaptorTracker</h1>
          <p className="text-raptor-muted text-sm mt-1">Ford Raptor Build Tracker</p>
        </div>

        <div className="card p-6 shadow-sm w-full">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input-field"
                placeholder="admin"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
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
        <p className="text-xs text-raptor-muted">© Copyright breed breed007@gmail.com 2026</p>
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
