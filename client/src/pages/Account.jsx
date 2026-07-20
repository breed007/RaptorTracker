import React, { useState } from 'react'
import { useApp } from '../context/AppContext'

export default function Account() {
  const { user, refreshUser } = useApp()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const onBootstrap = user?.mustChangePassword

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setDone(false)
    if (next !== confirm) { setError('The new passwords do not match.'); return }
    if (next.length < 12) { setError('Use at least 12 characters.'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not change the password.'); return }
      setCurrent(''); setNext(''); setConfirm(''); setDone(true)
      refreshUser?.()
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="page-title">Account</h1>
        <p className="text-raptor-secondary text-sm mt-0.5">
          Signed in as <span className="font-medium text-raptor-primary">{user?.username}</span>
        </p>
      </div>

      {onBootstrap && (
        <div className="card p-4 border-l-4 border-l-yellow-500">
          <div className="font-semibold text-raptor-primary mb-1">You're still using the password from <code>.env</code></div>
          <p className="text-sm text-raptor-secondary">
            That password sits in a plain text file on the server, and anyone who has ever had a
            copy of it can still sign in. Setting one here stores a hashed password in the database
            instead — after that, the value in <code>.env</code> is ignored entirely.
          </p>
        </div>
      )}

      <div className="card p-5">
        <div className="section-title mb-4">Change Password</div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input
              type="password" value={current} onChange={e => setCurrent(e.target.value)}
              className="input-field" autoComplete="current-password" required
            />
          </div>
          <div>
            <label className="label">New Password</label>
            <input
              type="password" value={next} onChange={e => setNext(e.target.value)}
              className="input-field" autoComplete="new-password" required
            />
            <p className="text-xs text-raptor-muted mt-1">
              At least 12 characters. A passphrase of a few unrelated words beats a short scramble.
            </p>
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className="input-field" autoComplete="new-password" required
            />
          </div>

          {error && <div className="text-sm text-red-500">{error}</div>}
          {done && <div className="text-sm text-green-600 dark:text-green-400">Password changed. It takes effect on your next sign-in.</div>}

          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Change Password'}
          </button>
        </form>
      </div>

      <div className="card p-5">
        <div className="section-title mb-3">Sign-in Protection</div>
        <ul className="text-sm text-raptor-secondary space-y-2 list-disc pl-5">
          <li>Sign-in attempts are limited to 10 failures per 15 minutes per IP address. Successful sign-ins don't count against it.</li>
          <li>Passwords are stored as a bcrypt hash, never in plain text.</li>
          <li>
            If you've put this on the public internet, serve it over HTTPS and set{' '}
            <code>COOKIE_SECURE=true</code> so the session cookie isn't sent in the clear.
          </li>
        </ul>
      </div>
    </div>
  )
}
