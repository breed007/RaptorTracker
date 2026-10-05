import React, { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import UnitsForm from '../components/UnitsForm'
import { toast } from '../lib/toast'

const CONVERTED = { distance: 'distance', volume: 'fuel volume and price', pressure: 'tire pressure' }

const listOf = (items) =>
  items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`

export default function Settings() {
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
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="text-raptor-secondary text-sm mt-0.5">How RaptorTracker measures and shows things.</p>
      </div>

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
        {error && <div className="text-sm text-red-500">{error}</div>}

        <div className="flex gap-2">
          <button type="button" onClick={save} disabled={!changed || saving} className="btn-primary disabled:opacity-40">
            {saving ? 'Saving…' : converting.length ? 'Convert and save' : 'Save'}
          </button>
          {changed && (
            <button type="button" onClick={() => { setDraft(saved); setError('') }} className="btn-secondary">Cancel</button>
          )}
        </div>
      </div>
    </div>
  )
}
