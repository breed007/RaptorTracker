import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useApp } from '../context/AppContext'
import StatsCard from '../components/StatsCard'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

function money(v) {
  if (v == null) return '—'
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const EMPTY = { date: '', odometer: '', note: '' }

export default function Analytics() {
  const { selectedVehicleId } = useApp()
  const [data, setData] = useState(null)
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchAll = useCallback(() => {
    if (!selectedVehicleId) return
    setLoading(true)
    Promise.all([
      fetch(`/api/analytics?vehicle_id=${selectedVehicleId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/mileage?vehicle_id=${selectedVehicleId}`).then(r => r.ok ? r.json() : []),
    ])
      .then(([a, m]) => { setData(a); setReadings(Array.isArray(m) ? m : []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedVehicleId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addReading = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.date || form.odometer === '') { setError('Date and odometer are required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/mileage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, user_vehicle_id: selectedVehicleId }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to save') }
      else { setForm(EMPTY); fetchAll() }
    } finally { setSaving(false) }
  }

  const deleteReading = async (id) => {
    await fetch(`/api/mileage/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  const trend = data?.mileageTrend || []
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--rl-accent').trim() || '#f97316'
  const chartData = {
    labels: trend.map(p => p.date),
    datasets: [{
      data: trend.map(p => p.odometer),
      borderColor: accent, backgroundColor: accent + '22',
      borderWidth: 2, pointRadius: 2, fill: true, tension: 0.2,
    }],
  }
  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.parsed.y.toLocaleString()} mi` } } },
    scales: {
      x: { ticks: { color: '#9ca3af', font: { size: 10 }, maxTicksLimit: 8 }, grid: { display: false } },
      y: { ticks: { color: '#9ca3af', font: { size: 10 }, callback: v => (v / 1000).toFixed(0) + 'k' }, grid: { color: '#ffffff10' } },
    },
  }

  const maxProvider = Math.max(1, ...(data?.maintenanceByProvider || []).map(p => p.total))

  return (
    <div className="space-y-5">
      <h1 className="page-title">Analytics</h1>

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard label="Miles / Month" value={data?.milesPerMonth != null ? Math.round(data.milesPerMonth).toLocaleString() : '—'} sub="tracked average" accent />
        <StatsCard label="Miles Tracked" value={data?.totalMilesTracked != null ? data.totalMilesTracked.toLocaleString() : '—'} sub="first → last reading" />
        <StatsCard label="Fuel Logged" value={data?.fuel ? `${data.fuel.gallons.toLocaleString()} gal` : '—'} sub={data?.fuel ? `${data.fuel.fills} fill-ups` : null} />
        <StatsCard label="Fuel Spend" value={data?.fuel ? money(data.fuel.cost) : '—'} />
      </div>

      {/* Mileage trend */}
      <div className="card p-5">
        <div className="section-title mb-3">Mileage Over Time</div>
        {trend.length >= 2 ? (
          <div style={{ height: 200 }}><Line data={chartData} options={chartOpts} /></div>
        ) : (
          <p className="text-sm text-raptor-secondary">Log at least two odometer readings (or fuel/service entries with mileage) to see a trend.</p>
        )}
      </div>

      {/* Maintenance by provider */}
      <div className="card p-5">
        <div className="section-title mb-3">Maintenance Cost by Provider</div>
        {(data?.maintenanceByProvider || []).length === 0 ? (
          <p className="text-sm text-raptor-secondary">No maintenance records yet.</p>
        ) : (
          <div className="space-y-2">
            {data.maintenanceByProvider.map(p => (
              <div key={p.provider} className="flex items-center gap-3">
                <span className="text-sm text-raptor-secondary w-28 flex-shrink-0">{p.label}</span>
                <div className="flex-1 bg-raptor-elevated rounded-full h-5 overflow-hidden">
                  <div className="h-full bg-raptor-accent rounded-full" style={{ width: `${(p.total / maxProvider) * 100}%` }} />
                </div>
                <span className="text-sm text-raptor-primary font-semibold w-20 text-right tabular-nums">{money(p.total)}</span>
                <span className="text-xs text-raptor-muted w-14 text-right">{p.count} rec</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Odometer log */}
      <div className="card p-5">
        <div className="section-title mb-3">Odometer Log</div>
        <form onSubmit={addReading} className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="label">Date</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="label">Odometer</label>
            <input type="number" value={form.odometer} onChange={e => set('odometer', e.target.value)} className="input-field w-36" placeholder="e.g. 24500" required />
          </div>
          <div className="flex-1 min-w-[8rem]">
            <label className="label">Note</label>
            <input type="text" value={form.note} onChange={e => set('note', e.target.value)} className="input-field" placeholder="Optional" />
          </div>
          <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Log'}</button>
        </form>
        {error && <div className="text-sm text-red-500 mb-3">{error}</div>}

        {loading ? (
          <div className="text-raptor-muted animate-pulse text-sm">Loading…</div>
        ) : readings.length === 0 ? (
          <p className="text-sm text-raptor-secondary">No manual readings yet. Fuel and service mileage still feed the trend above.</p>
        ) : (
          <div className="space-y-1.5">
            {readings.map(r => (
              <div key={r.id} className="flex items-center gap-3 text-sm py-1 border-b border-raptor-border last:border-0">
                <span className="text-raptor-primary font-medium w-28">{r.odometer.toLocaleString()} mi</span>
                <span className="text-raptor-muted">{fmtDate(r.date)}</span>
                {r.note && <span className="text-raptor-secondary truncate">{r.note}</span>}
                <button onClick={() => deleteReading(r.id)} className="ml-auto text-raptor-muted hover:text-red-500" title="Delete">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
