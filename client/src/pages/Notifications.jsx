import React, { useEffect, useState } from 'react'

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded accent-raptor-accent mt-0.5 cursor-pointer" />
      <span>
        <span className="text-sm font-medium text-raptor-primary">{label}</span>
        {hint && <span className="block text-xs text-raptor-muted">{hint}</span>}
      </span>
    </label>
  )
}

export default function Notifications() {
  const [settings, setSettings] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'ok'|'err', text }

  const load = () => {
    fetch('/api/notifications/settings').then(r => r.json()).then(setSettings)
    fetch('/api/notifications/preview').then(r => r.json()).then(setPreview).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }))

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/notifications/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      setSettings(data)
      setMsg({ type: 'ok', text: 'Settings saved.' })
    } catch {
      setMsg({ type: 'err', text: 'Failed to save.' })
    } finally { setSaving(false) }
  }

  const sendTest = async () => {
    setMsg(null)
    const res = await fetch('/api/notifications/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: settings.email }),
    })
    const data = await res.json()
    setMsg(res.ok ? { type: 'ok', text: `Test email sent to ${data.to}.` } : { type: 'err', text: data.error || 'Failed to send test.' })
  }

  const sendNow = async () => {
    setMsg(null)
    const res = await fetch('/api/notifications/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onlyNew: true }),
    })
    const data = await res.json()
    if (res.ok && data.sent) setMsg({ type: 'ok', text: `Sent ${data.count} reminder(s) to ${data.to}.` })
    else if (res.ok) setMsg({ type: 'ok', text: `Nothing sent — ${data.reason}.` })
    else setMsg({ type: 'err', text: data.error || 'Failed to send.' })
  }

  if (!settings) return <div className="text-raptor-muted animate-pulse">Loading…</div>

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="page-title">Notifications</h1>

      {!settings.smtpConfigured && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-400">
          <strong>SMTP is not configured.</strong> Add <code>SMTP_HOST</code>, <code>SMTP_FROM</code>, and credentials
          to your <code>.env</code>, then restart the server. Until then, emails can't be sent.
        </div>
      )}

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm ${msg.type === 'ok'
          ? 'border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
          : 'border border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {/* Settings */}
      <div className="card p-5 space-y-4">
        <div className="section-title">Email Reminders</div>

        <Toggle
          checked={settings.enabled}
          onChange={v => set('enabled', v)}
          label="Enable email reminders"
          hint="A daily check (08:00 server time) emails you anything new that's due or expiring."
        />

        <div>
          <label className="label">Recipient email</label>
          <input
            type="email" value={settings.email}
            onChange={e => set('email', e.target.value)}
            className="input-field" placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2 pt-1">
          <Toggle checked={settings.service} onChange={v => set('service', v)} label="Service interval reminders" hint="Overdue and due-soon maintenance." />
          <Toggle checked={settings.warranty} onChange={v => set('warranty', v)} label="Warranty reminders" hint="Expired and soon-to-expire vehicle and mod warranties." />
          <Toggle checked={settings.compliance} onChange={v => set('compliance', v)} label="Registration, inspection & insurance" hint="Renewals and expirations for registration, inspection/emissions, and insurance." />
        </div>

        <div>
          <label className="label">Warranty reminder window (days before expiry)</label>
          <input
            type="number" min="1" value={settings.warrantyThresholdDays}
            onChange={e => set('warrantyThresholdDays', e.target.value)}
            className="input-field w-32"
          />
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Save Settings'}</button>
          <button onClick={sendTest} disabled={!settings.smtpConfigured || !settings.email} className="btn-secondary text-sm disabled:opacity-50">Send Test Email</button>
          <button onClick={sendNow} disabled={!settings.smtpConfigured || !settings.enabled} className="btn-secondary text-sm disabled:opacity-50">Send Digest Now</button>
        </div>
      </div>

      {/* Outstanding preview */}
      <div className="card p-5">
        <div className="section-title mb-3">Currently Outstanding {preview ? `(${preview.count})` : ''}</div>
        {!preview || preview.count === 0 ? (
          <p className="text-sm text-raptor-secondary">Nothing due or expiring right now.</p>
        ) : (
          <div className="space-y-2">
            {preview.items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                  it.state === 'overdue' || it.state === 'expired'
                    ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-500'
                }`}>{it.state}</span>
                <span className="text-raptor-primary font-medium">{it.title}</span>
                <span className="text-raptor-muted">{it.detail}</span>
                <span className="text-raptor-muted ml-auto text-xs">{it.vehicleName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
