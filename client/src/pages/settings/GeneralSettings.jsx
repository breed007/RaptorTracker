import React, { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import UnitsForm from '../../components/UnitsForm'
import { toast } from '../../lib/toast'

const CONVERTED = { distance: 'distance', volume: 'fuel volume and price', pressure: 'tire pressure' }

const listOf = (items) =>
  items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`

const UPGRADE_STEPS = {
  docker: 'docker compose pull && docker compose up -d',
  source: 'git pull && npm install && npm run build && pm2 restart raptortracker',
}

const fmtWhen = (iso) => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
}

function UpdatesCard() {
  const { updateInfo: info, setUpdateInfo } = useApp()
  const [busy, setBusy] = useState(false)

  const call = async (method, url, body) => {
    setBusy(true)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
      if (res.ok) setUpdateInfo(await res.json())
    } finally { setBusy(false) }
  }

  if (!info) return null
  const checked = fmtWhen(info.checkedAt)

  return (
    <div className="card p-5 space-y-3">
      <div className="section-title">Updates</div>
      <p className="text-sm text-raptor-secondary">
        You&apos;re running <span className="font-medium text-raptor-primary">v{info.current}</span>.{' '}
        {info.available ? (
          <>
            <span className="font-medium text-green-700 dark:text-green-400">v{info.latest} is available</span>
            {fmtWhen(info.publishedAt) && <> (released {fmtWhen(info.publishedAt)})</>}.{' '}
            <a href={info.url} target="_blank" rel="noopener noreferrer" className="text-raptor-link underline underline-offset-2 hover:no-underline">What&apos;s new ↗</a>
          </>
        ) : info.latest ? 'That\'s the latest release.' : null}
      </p>

      {info.available && (
        <div className="text-sm space-y-1">
          <div className="text-raptor-muted text-xs">To update, back up first, then run this on the server:</div>
          <code className="block text-xs font-mono px-3 py-2 rounded bg-raptor-elevated border border-raptor-border overflow-x-auto whitespace-nowrap select-all">
            {UPGRADE_STEPS[info.install] || UPGRADE_STEPS.source}
          </code>
        </div>
      )}

      {info.envDisabled ? (
        <p className="text-xs text-raptor-muted">Release checks are turned off for this server (<code>UPDATE_CHECK=false</code>).</p>
      ) : (
        <>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox" checked={info.enabled} disabled={busy}
              onChange={e => call('PUT', '/api/settings/updates', { enabled: e.target.checked })}
              className="w-4 h-4 rounded accent-raptor-accent mt-0.5 cursor-pointer"
            />
            <span>
              <span className="text-sm font-medium text-raptor-primary">Check for new releases once a day</span>
              <span className="block text-xs text-raptor-muted">
                The server asks GitHub&apos;s public API for the latest RaptorTracker release. The request names the
                RaptorTracker version and nothing else; GitHub sees your server&apos;s IP address, as with any visit.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => call('POST', '/api/settings/updates/check')} disabled={busy} className="btn-secondary text-sm disabled:opacity-50">
              {busy ? 'Checking…' : 'Check now'}
            </button>
            {checked && <span className="text-xs text-raptor-muted">Last checked {checked}{info.error ? ` — ${info.error}` : ''}</span>}
          </div>
        </>
      )}
    </div>
  )
}

export default function GeneralSettings() {
  const { refreshUnits } = useApp()
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings/units')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setSaved(d.units); setDraft(d.units) } })
      .catch(() => setError('Could not load your settings.'))
  }, [])

  const changed = saved && draft && Object.keys(saved).some(k => saved[k] !== draft[k])
  const converting = saved && draft ? Object.keys(CONVERTED).filter(k => saved[k] !== draft[k]) : []
  const currencyChanged = saved && draft && saved.currency !== draft.currency

  const save = async () => {
    setError('')
    if (!/^[A-Z]{3}$/.test(draft.currency)) { setError('Currency is a three-letter code, such as USD or CAD.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/settings/units', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not save.'); return }
      setSaved(data.units); setDraft(data.units)
      await refreshUnits()
      toast(
        data.converted
          ? `Units saved. ${data.converted.toLocaleString()} stored values were converted${data.snapshot ? `; the database from before is in data/backups/${data.snapshot}` : ''}.`
          : 'Units saved.',
        { tone: 'success', duration: 10000 },
      )
    } catch {
      setError('Could not save — check your connection.')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">

      <div className="card p-5 space-y-4">
        <div className="section-title">Units &amp; Currency</div>
        {!draft && !error && <div className="text-raptor-muted animate-pulse text-sm">Loading…</div>}
        {draft && <UnitsForm value={draft} onChange={setDraft} />}

        {converting.length > 0 && (
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-raptor-secondary">
            Saving converts every stored {listOf(converting.map(k => CONVERTED[k]))} to the new units, so
            your history reads correctly. A copy of the database is saved to <code>data/backups/</code> first.
          </div>
        )}
        {currencyChanged && (
          <p className="text-xs text-raptor-muted">
            Changing currency changes the symbol only. Amounts you&apos;ve entered aren&apos;t exchanged.
          </p>
        )}
        {error && <div className="text-sm text-red-700 dark:text-red-400">{error}</div>}

        <div className="flex gap-2">
          <button type="button" onClick={save} disabled={!changed || saving} className="btn-primary disabled:opacity-40">
            {saving ? 'Saving…' : converting.length ? 'Convert and save' : 'Save'}
          </button>
          {changed && (
            <button type="button" onClick={() => { setDraft(saved); setError('') }} className="btn-secondary">Cancel</button>
          )}
        </div>
      </div>

      <UpdatesCard />
    </div>
  )
}
