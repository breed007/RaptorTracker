import React, { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'

// Valid VIN: 17 chars, no I O Q
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/

/**
 * First-run experience. Shown when the account has no vehicles yet, so a new
 * install walks the owner through adding their own truck instead of dropping
 * them into an empty dashboard.
 */
export default function Welcome() {
  const { refreshVehicles, selectVehicle } = useApp()
  const [refVehicles, setRefVehicles] = useState([])
  const [form, setForm] = useState({ vin: '', vehicle_id: '', nickname: '', model_year: '', color: '' })
  const [vinLoading, setVinLoading] = useState(false)
  const [vinResult, setVinResult] = useState(null)
  const [vinError, setVinError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/vehicles').then(r => r.json()).then(setRefVehicles).catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleVinChange = (raw) => {
    set('vin', raw.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''))
    setVinResult(null); setVinError('')
  }

  const decodeVin = async () => {
    if (!VIN_RE.test(form.vin)) return
    setVinLoading(true); setVinError(''); setVinResult(null)
    try {
      const res = await fetch(`/api/vin/${form.vin}`)
      const data = await res.json()
      if (!res.ok) { setVinError(data.error || 'VIN lookup failed'); return }
      setVinResult(data)
      setForm(f => ({
        ...f,
        model_year: data.year ? String(data.year) : f.model_year,
        vehicle_id: data.refVehicleId ? String(data.refVehicleId) : f.vehicle_id,
      }))
    } catch {
      setVinError('VIN lookup unavailable — you can still pick your model below.')
    } finally { setVinLoading(false) }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.vehicle_id) { setError('Pick which Raptor you have.'); return }
    if (!form.nickname.trim()) { setError('Give your truck a name.'); return }
    if (!form.model_year) { setError('Model year is required.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/user-vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, vin: form.vin || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not add the vehicle.'); return }
      await refreshVehicles()
      selectVehicle(data.id)
    } catch {
      setError('Could not add the vehicle — check your connection.')
    } finally { setSaving(false) }
  }

  const vinValid = VIN_RE.test(form.vin)

  return (
    <div className="min-h-screen bg-raptor-base flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="font-display font-bold text-3xl text-raptor-accent tracking-wide">RaptorTracker</div>
          <p className="text-raptor-secondary mt-2">
            Let's add your truck. Everything else — mods, service, fuel, costs — hangs off this.
          </p>
        </div>

        <form onSubmit={submit} className="card p-6 space-y-4">
          <div>
            <label className="label">VIN <span className="font-normal text-raptor-muted">(optional — fills in the rest)</span></label>
            <div className="flex gap-2">
              <input
                type="text" value={form.vin} onChange={e => handleVinChange(e.target.value)}
                className="input-field font-mono uppercase tracking-wider flex-1"
                placeholder="17-character VIN" maxLength={17} spellCheck={false}
              />
              <button type="button" onClick={decodeVin} disabled={!vinValid || vinLoading}
                className="btn-secondary text-sm whitespace-nowrap disabled:opacity-40">
                {vinLoading ? 'Looking up…' : 'Decode'}
              </button>
            </div>
            {form.vin && !vinValid && (
              <p className="mt-1 text-xs text-raptor-muted">{form.vin.length}/17 — letters I, O and Q aren't used in VINs.</p>
            )}
            {vinError && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{vinError}</p>}
            {vinResult && (
              <p className="mt-1.5 text-xs text-green-600 dark:text-green-400">
                Found: {[vinResult.year, vinResult.make, vinResult.model].filter(Boolean).join(' ')}
                {vinResult.generation ? ` · ${vinResult.generation}` : ''}
              </p>
            )}
          </div>

          <div>
            <label className="label">Which Raptor? *</label>
            <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} className="input-field" required>
              <option value="">Select your model…</option>
              {refVehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} {v.generation}{v.variant ? ` (${v.variant})` : ''} — {v.model_year_start}–{v.model_year_end || 'present'}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Name it *</label>
              <input type="text" value={form.nickname} onChange={e => set('nickname', e.target.value)}
                className="input-field" placeholder="e.g. Daily Driver" required />
            </div>
            <div>
              <label className="label">Model Year *</label>
              <input type="number" value={form.model_year} onChange={e => set('model_year', e.target.value)}
                className="input-field" placeholder="2025" min="2010" max="2030" required />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Color</label>
              <input type="text" value={form.color} onChange={e => set('color', e.target.value)}
                className="input-field" placeholder="e.g. Carbonized Gray" />
            </div>
          </div>

          {error && <div className="text-sm text-red-500">{error}</div>}

          <button type="submit" disabled={saving} className="btn-primary w-full py-3 disabled:opacity-50">
            {saving ? 'Adding…' : 'Add My Truck'}
          </button>
          <p className="text-xs text-raptor-muted text-center">
            You can add more vehicles, photos, and purchase details later in My Garage.
          </p>
        </form>
      </div>
    </div>
  )
}
