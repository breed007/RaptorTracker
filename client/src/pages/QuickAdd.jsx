import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const SERVICE_TYPES = [
  'Oil Change', 'Tire Rotation', 'Air Filter (Engine)', 'Air Filter (Cabin)',
  'Diff Fluid', 'Transfer Case Fluid', 'Brake Service', 'Alignment',
  'Wheel Balance', 'Spark Plugs', 'Battery', 'Coolant Flush',
  'Transmission Fluid', 'Brake Fluid', 'Fuel Filter',
]

const today = () => new Date().toISOString().slice(0, 10)

const TABS = [
  { id: 'fuel', label: 'Fuel' },
  { id: 'odometer', label: 'Odometer' },
  { id: 'service', label: 'Service' },
]

/**
 * Phone-first quick entry. The highest-frequency actions (fuel fill, odometer
 * reading, a service) happen standing at a pump or a counter — not at a desk.
 * Big targets, minimum fields, stays put so you can log another.
 */
export default function QuickAdd() {
  const { selectedVehicleId, selectedVehicle } = useApp()
  const [tab, setTab] = useState('fuel')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null) // { type, text }

  const [fuel, setFuel] = useState({ date: today(), odometer: '', gallons: '', price_per_gallon: '', total_cost: '', station: '' })
  const [odo, setOdo] = useState({ date: today(), odometer: '', note: '' })
  const [svc, setSvc] = useState({ service_type: '', date_performed: today(), mileage: '', cost: '', service_provider_type: '', vendor: '' })

  const post = async (url, body, onDone) => {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, user_vehicle_id: selectedVehicleId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ type: 'err', text: data.error || 'Could not save.' }); return false }
      setMsg({ type: 'ok', text: 'Saved.' })
      onDone?.()
      return true
    } catch {
      setMsg({ type: 'err', text: 'Could not save — check your connection.' })
      return false
    } finally { setSaving(false) }
  }

  const submitFuel = async (e) => {
    e.preventDefault()
    await post('/api/fuel', {
      date: fuel.date,
      odometer: fuel.odometer,
      gallons: fuel.gallons,
      price_per_gallon: fuel.price_per_gallon !== '' ? fuel.price_per_gallon : null,
      total_cost: fuel.total_cost !== '' ? fuel.total_cost : null,
      station: fuel.station || null,
      full_tank: true,
    }, () => setFuel({ date: today(), odometer: '', gallons: '', price_per_gallon: '', total_cost: '', station: '' }))
  }

  const submitOdo = async (e) => {
    e.preventDefault()
    await post('/api/mileage', odo, () => setOdo({ date: today(), odometer: '', note: '' }))
  }

  const submitSvc = async (e) => {
    e.preventDefault()
    if (!svc.service_type) { setMsg({ type: 'err', text: 'Pick a service type.' }); return }
    await post('/api/maintenance', {
      service_type: svc.service_type,
      date_performed: svc.date_performed,
      mileage: svc.mileage !== '' ? svc.mileage : null,
      cost: svc.cost !== '' ? svc.cost : null,
      service_provider_type: svc.service_provider_type || null,
      vendor: svc.vendor || null,
    }, () => setSvc({ service_type: '', date_performed: today(), mileage: '', cost: '', service_provider_type: '', vendor: '' }))
  }

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  const field = 'input-field text-base py-3' // larger touch targets on phones

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div>
        <h1 className="page-title">Quick Add</h1>
        {selectedVehicle && <p className="text-raptor-secondary text-sm mt-0.5">{selectedVehicle.nickname}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-raptor-elevated border border-raptor-border rounded-lg p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setMsg(null) }}
            className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
              tab === t.id ? 'bg-raptor-card text-raptor-primary border border-raptor-border shadow-sm' : 'text-raptor-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm ${msg.type === 'ok'
          ? 'border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
          : 'border border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {tab === 'fuel' && (
        <form onSubmit={submitFuel} className="card p-4 space-y-3">
          <div>
            <label className="label">Odometer *</label>
            <input type="number" inputMode="numeric" value={fuel.odometer} onChange={e => setFuel(f => ({ ...f, odometer: e.target.value }))} className={field} placeholder="24500" required />
          </div>
          <div>
            <label className="label">Gallons *</label>
            <input type="number" inputMode="decimal" step="0.001" value={fuel.gallons} onChange={e => setFuel(f => ({ ...f, gallons: e.target.value }))} className={field} placeholder="26.2" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">$ / gal</label>
              <input type="number" inputMode="decimal" step="0.001" value={fuel.price_per_gallon} onChange={e => setFuel(f => ({ ...f, price_per_gallon: e.target.value }))} className={field} placeholder="3.459" />
            </div>
            <div>
              <label className="label">Total $</label>
              <input type="number" inputMode="decimal" step="0.01" value={fuel.total_cost} onChange={e => setFuel(f => ({ ...f, total_cost: e.target.value }))} className={field} placeholder="auto" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" value={fuel.date} onChange={e => setFuel(f => ({ ...f, date: e.target.value }))} className={field} required />
            </div>
            <div>
              <label className="label">Station</label>
              <input type="text" value={fuel.station} onChange={e => setFuel(f => ({ ...f, station: e.target.value }))} className={field} placeholder="Costco" />
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-base disabled:opacity-50">
            {saving ? 'Saving…' : 'Log Fill-up'}
          </button>
        </form>
      )}

      {tab === 'odometer' && (
        <form onSubmit={submitOdo} className="card p-4 space-y-3">
          <div>
            <label className="label">Odometer *</label>
            <input type="number" inputMode="numeric" value={odo.odometer} onChange={e => setOdo(o => ({ ...o, odometer: e.target.value }))} className={field} placeholder="24500" required />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" value={odo.date} onChange={e => setOdo(o => ({ ...o, date: e.target.value }))} className={field} required />
          </div>
          <div>
            <label className="label">Note</label>
            <input type="text" value={odo.note} onChange={e => setOdo(o => ({ ...o, note: e.target.value }))} className={field} placeholder="Optional" />
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-base disabled:opacity-50">
            {saving ? 'Saving…' : 'Log Odometer'}
          </button>
        </form>
      )}

      {tab === 'service' && (
        <form onSubmit={submitSvc} className="card p-4 space-y-3">
          <div>
            <label className="label">Service *</label>
            <select value={svc.service_type} onChange={e => setSvc(s => ({ ...s, service_type: e.target.value }))} className={field} required>
              <option value="">Select…</option>
              {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" value={svc.date_performed} onChange={e => setSvc(s => ({ ...s, date_performed: e.target.value }))} className={field} required />
            </div>
            <div>
              <label className="label">Mileage</label>
              <input type="number" inputMode="numeric" value={svc.mileage} onChange={e => setSvc(s => ({ ...s, mileage: e.target.value }))} className={field} placeholder="24500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Cost</label>
              <input type="number" inputMode="decimal" step="0.01" value={svc.cost} onChange={e => setSvc(s => ({ ...s, cost: e.target.value }))} className={field} placeholder="0.00" />
            </div>
            <div>
              <label className="label">Serviced by</label>
              <select value={svc.service_provider_type} onChange={e => setSvc(s => ({ ...s, service_provider_type: e.target.value }))} className={field}>
                <option value="">—</option>
                <option value="dealership">Dealership</option>
                <option value="independent">Independent</option>
                <option value="owner">Owner / DIY</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-base disabled:opacity-50">
            {saving ? 'Saving…' : 'Log Service'}
          </button>
        </form>
      )}

      <p className="text-xs text-raptor-muted text-center">
        Need more fields? Open the full <Link to="/fuel" className="text-raptor-accent hover:underline">Fuel Log</Link> or{' '}
        <Link to="/maintenance" className="text-raptor-accent hover:underline">Maintenance</Link> page.
      </p>
    </div>
  )
}
