import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useApp } from '../context/AppContext'
import ConfirmModal from '../components/ConfirmModal'
import StatsCard from '../components/StatsCard'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

// ── Constants ────────────────────────────────────────────────────────────────

const TRIP_TYPES = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'city', label: 'City' },
  { value: 'highway', label: 'Highway' },
]

const EMPTY_FORM = {
  date: '',
  odometer: '',
  gallons: '',
  price_per_gallon: '',
  total_cost: '',
  station: '',
  trip_type: 'mixed',
  full_tank: true,
  notes: '',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtOdo(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('en-US') + ' mi'
}

function fmtMoney(val, decimals = 2) {
  if (val == null || val === '') return '—'
  return '$' + Number(val).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtMpg(val) {
  if (val == null) return null
  return Number(val).toFixed(1)
}

function fmtOdoShort(val) {
  // "XXXk mi" for chart axis
  const n = Number(val)
  return (n / 1000).toFixed(0) + 'k mi'
}

// ── MPG Badge ────────────────────────────────────────────────────────────────

function MpgBadge({ mpg, factoryHwy }) {
  if (mpg == null) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-raptor-elevated text-raptor-muted">
        — mpg
      </span>
    )
  }
  const val = Number(mpg)
  let colorCls = 'bg-green-500/15 text-green-500'
  if (factoryHwy != null) {
    const fhwy = Number(factoryHwy)
    if (val >= fhwy) {
      colorCls = 'bg-green-500/15 text-green-500'
    } else if (val >= fhwy - 2) {
      colorCls = 'bg-yellow-500/15 text-yellow-500'
    } else {
      colorCls = 'bg-red-500/15 text-red-400'
    }
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${colorCls}`}>
      {val.toFixed(1)} mpg
    </span>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function FuelLog() {
  const { selectedVehicleId, selectedVehicle, darkMode } = useApp()

  // Data state
  const [entries, setEntries] = useState([])
  const [stats, setStats] = useState(null)
  const [chartData, setChartData] = useState([])
  const [factoryMpg, setFactoryMpg] = useState({ city: null, hwy: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState(null)

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchFuel = useCallback(() => {
    if (!selectedVehicleId) return
    setLoading(true)
    setError('')
    fetch(`/api/fuel?vehicle_id=${selectedVehicleId}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load fuel log')
        return r.json()
      })
      .then(data => {
        setEntries(data.entries || [])
        setStats(data.stats || null)
        setChartData(data.chartData || [])
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [selectedVehicleId])

  const fetchFactoryMpg = useCallback(() => {
    if (!selectedVehicle?.vehicle_id) return
    fetch(`/api/vehicles/${selectedVehicle.vehicle_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setFactoryMpg({ city: data.mpg_city ?? null, hwy: data.mpg_highway ?? null })
        }
      })
      .catch(() => {})
  }, [selectedVehicle])

  useEffect(() => {
    fetchFuel()
    fetchFactoryMpg()
  }, [fetchFuel, fetchFactoryMpg])

  // ── Form helpers ───────────────────────────────────────────────────────────

  const openNew = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowForm(true)
    // Scroll to form
    setTimeout(() => {
      document.getElementById('fuel-form-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const openEdit = (entry) => {
    setEditId(entry.id)
    setForm({
      date: entry.date || '',
      odometer: entry.odometer ?? '',
      gallons: entry.gallons ?? '',
      price_per_gallon: entry.price_per_gallon ?? '',
      total_cost: entry.total_cost ?? '',
      station: entry.station || '',
      trip_type: entry.trip_type || 'mixed',
      full_tank: entry.full_tank !== false,
      notes: entry.notes || '',
    })
    setFormError('')
    setShowForm(true)
    setTimeout(() => {
      document.getElementById('fuel-form-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditId(null)
    setFormError('')
  }

  const setField = (field, value) => {
    setForm(f => {
      const next = { ...f, [field]: value }
      // Auto-calculate total_cost if both gallons and price_per_gallon are set and total_cost is empty/user hasn't touched it
      if (
        (field === 'gallons' || field === 'price_per_gallon') &&
        next.gallons !== '' &&
        next.price_per_gallon !== ''
      ) {
        const calculated = (parseFloat(next.gallons) * parseFloat(next.price_per_gallon)).toFixed(2)
        if (!isNaN(calculated) && next.total_cost === '') {
          next.total_cost = calculated
        }
      }
      return next
    })
  }

  const handleTotalCostChange = (val) => {
    setForm(f => ({ ...f, total_cost: val }))
  }

  const handleGallonsOrPriceChange = (field, val) => {
    setForm(f => {
      const next = { ...f, [field]: val }
      // Re-auto-calc only if total_cost matches old auto-calc (i.e. user hasn't manually changed it)
      const oldAuto = (parseFloat(f.gallons) * parseFloat(f.price_per_gallon)).toFixed(2)
      const isAuto = f.total_cost === '' || f.total_cost === oldAuto || isNaN(parseFloat(oldAuto))
      if (isAuto && next.gallons !== '' && next.price_per_gallon !== '') {
        const calc = (parseFloat(next.gallons) * parseFloat(next.price_per_gallon)).toFixed(2)
        if (!isNaN(calc)) next.total_cost = calc
      }
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')

    if (!form.date) { setFormError('Date is required'); return }
    if (form.odometer === '') { setFormError('Odometer is required'); return }
    if (form.gallons === '') { setFormError('Gallons is required'); return }

    setSaving(true)
    const payload = {
      user_vehicle_id: selectedVehicleId,
      date: form.date,
      odometer: parseInt(form.odometer, 10),
      gallons: parseFloat(form.gallons),
      price_per_gallon: form.price_per_gallon !== '' ? parseFloat(form.price_per_gallon) : null,
      total_cost: form.total_cost !== '' ? parseFloat(form.total_cost) : null,
      station: form.station || null,
      notes: form.notes || null,
      full_tank: form.full_tank,
      trip_type: form.trip_type,
    }

    try {
      const url = editId ? `/api/fuel/${editId}` : '/api/fuel'
      const method = editId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json()
        setFormError(d.error || 'Failed to save entry')
      } else {
        fetchFuel()
        closeForm()
      }
    } catch {
      setFormError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await fetch(`/api/fuel/${deleteTarget}`, { method: 'DELETE' })
      fetchFuel()
    } catch {
      // Silently swallow — entry will reappear on next load
    } finally {
      setDeleteTarget(null)
    }
  }

  // ── Chart config ───────────────────────────────────────────────────────────

  const accentColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--rl-accent')
    .trim() || (darkMode ? '#f97316' : '#ea580c')

  const lineChartData = {
    labels: chartData.map(d => fmtOdoShort(d.odometer)),
    datasets: [
      {
        data: chartData.map(d => d.mpg),
        borderColor: accentColor,
        backgroundColor: accentColor + '28',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: accentColor,
        fill: true,
        tension: 0.3,
      },
    ],
  }

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => `${ctx.parsed.y.toFixed(1)} mpg`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: darkMode ? '#9ca3af' : '#6b7280',
          font: { size: 11 },
          maxRotation: 45,
        },
        grid: { color: darkMode ? '#ffffff10' : '#00000010' },
      },
      y: {
        ticks: {
          color: darkMode ? '#9ca3af' : '#6b7280',
          font: { size: 11 },
          callback: val => val.toFixed(0) + ' mpg',
        },
        grid: { color: darkMode ? '#ffffff10' : '#00000010' },
      },
    },
  }

  // ── MPG comparison ─────────────────────────────────────────────────────────

  const avgMpg = stats?.avgMpg ? parseFloat(stats.avgMpg) : null
  const hasFactoryMpg = factoryMpg.city != null || factoryMpg.hwy != null

  let comparisonLine = null
  if (avgMpg != null && factoryMpg.hwy != null) {
    const diff = avgMpg - Number(factoryMpg.hwy)
    const sign = diff >= 0 ? '+' : ''
    comparisonLine = `Your avg: ${avgMpg.toFixed(1)} mpg vs. factory highway: ${factoryMpg.hwy} mpg (${sign}${diff.toFixed(1)})`
  }

  // ── No vehicle guard ───────────────────────────────────────────────────────

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4 text-center">
        <svg className="w-12 h-12 text-raptor-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 10h2l1 2h12l1-2h2M5 10V6a2 2 0 012-2h10a2 2 0 012 2v4M7 16a1 1 0 100 2 1 1 0 000-2zm10 0a1 1 0 100 2 1 1 0 000-2z" />
        </svg>
        <p className="text-raptor-secondary">No vehicle selected. Add one in your garage first.</p>
        <Link to="/garage" className="btn-primary text-sm">Go to Garage</Link>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="page-title">Fuel Log</h1>
        <button onClick={openNew} className="btn-primary text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Fill-up
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Stats row ── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatsCard
            label="Avg MPG"
            value={stats.avgMpg ? parseFloat(stats.avgMpg).toFixed(1) : '—'}
            sub={stats.entryCount ? `${stats.entryCount} fill-ups` : null}
            accent
          />
          <StatsCard
            label="Best MPG"
            value={stats.bestMpg ? parseFloat(stats.bestMpg).toFixed(1) : '—'}
            sub={stats.worstMpg ? `Worst: ${parseFloat(stats.worstMpg).toFixed(1)}` : null}
          />
          <StatsCard
            label="Total Fuel Cost"
            value={
              stats.totalCost != null
                ? '$' + Number(stats.totalCost).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                : '—'
            }
            sub={
              stats.costPerMile != null
                ? `$${parseFloat(stats.costPerMile).toFixed(3)}/mi`
                : null
            }
          />
          <StatsCard
            label="Total Gallons"
            value={
              stats.totalGallons != null
                ? Number(stats.totalGallons).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' gal'
                : '—'
            }
          />
        </div>
      )}

      {/* ── Factory MPG comparison ── */}
      {hasFactoryMpg && (
        <div className="card p-4 space-y-2">
          <div className="section-title">Factory EPA Rating</div>
          <div className="flex flex-wrap gap-4 text-sm">
            {factoryMpg.city != null && (
              <span className="text-raptor-secondary">
                City: <span className="font-semibold text-raptor-primary">{factoryMpg.city} mpg</span>
              </span>
            )}
            {factoryMpg.hwy != null && (
              <span className="text-raptor-secondary">
                Highway: <span className="font-semibold text-raptor-primary">{factoryMpg.hwy} mpg</span>
              </span>
            )}
          </div>
          {comparisonLine && (
            <p className="text-sm text-raptor-secondary">{comparisonLine}</p>
          )}
          <p className="text-xs text-raptor-muted">
            EPA estimates. Actual results vary with mods, tires, and driving style.
          </p>
        </div>
      )}

      {/* ── MPG trend chart ── */}
      {chartData.length >= 2 && (
        <div className="card p-4">
          <div className="section-title mb-3">MPG Over Time</div>
          <div style={{ height: 180 }}>
            <Line data={lineChartData} options={lineChartOptions} />
          </div>
        </div>
      )}

      {/* ── Form anchor ── */}
      <div id="fuel-form-anchor" />

      {/* ── Add / Edit form ── */}
      {showForm && (
        <div className="card p-5">
          <div className="section-title mb-4">{editId ? 'Edit Fill-up' : 'Log Fill-up'}</div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Date */}
            <div>
              <label className="label">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setField('date', e.target.value)}
                className="input-field"
                required
              />
            </div>

            {/* Odometer */}
            <div>
              <label className="label">Odometer (mi) *</label>
              <input
                type="number"
                value={form.odometer}
                onChange={e => setField('odometer', e.target.value)}
                className="input-field"
                placeholder="e.g. 24500"
                min="0"
                step="1"
                required
              />
            </div>

            {/* Gallons */}
            <div>
              <label className="label">Gallons *</label>
              <input
                type="number"
                value={form.gallons}
                onChange={e => handleGallonsOrPriceChange('gallons', e.target.value)}
                className="input-field"
                placeholder="e.g. 26.200"
                min="0"
                step="0.001"
                required
              />
            </div>

            {/* Price per gallon */}
            <div>
              <label className="label">Price per Gallon</label>
              <input
                type="number"
                value={form.price_per_gallon}
                onChange={e => handleGallonsOrPriceChange('price_per_gallon', e.target.value)}
                className="input-field"
                placeholder="e.g. 3.459"
                min="0"
                step="0.001"
              />
            </div>

            {/* Total cost */}
            <div>
              <label className="label">Total Cost</label>
              <input
                type="number"
                value={form.total_cost}
                onChange={e => handleTotalCostChange(e.target.value)}
                className="input-field"
                placeholder="Auto-calculated"
                min="0"
                step="0.01"
              />
            </div>

            {/* Station */}
            <div>
              <label className="label">Station</label>
              <input
                type="text"
                value={form.station}
                onChange={e => setField('station', e.target.value)}
                className="input-field"
                placeholder="e.g. Costco, Shell"
              />
            </div>

            {/* Trip type */}
            <div>
              <label className="label">Trip Type</label>
              <select
                value={form.trip_type}
                onChange={e => setField('trip_type', e.target.value)}
                className="input-field"
              >
                {TRIP_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Full tank checkbox */}
            <div className="flex items-center gap-3 pt-5">
              <input
                id="full_tank"
                type="checkbox"
                checked={form.full_tank}
                onChange={e => setField('full_tank', e.target.checked)}
                className="w-4 h-4 rounded accent-raptor-accent cursor-pointer"
              />
              <label htmlFor="full_tank" className="label mb-0 cursor-pointer select-none">
                Full tank
                <span className="block font-normal text-raptor-muted" style={{ fontSize: '0.7rem' }}>
                  MPG calculated only on full fills
                </span>
              </label>
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                className="input-field"
                rows={2}
                placeholder="Highway trip, loaded trailer, etc."
              />
            </div>

            {formError && (
              <div className="sm:col-span-2 text-sm text-red-500 dark:text-red-400">{formError}</div>
            )}

            <div className="sm:col-span-2 flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary text-sm">
                {saving ? 'Saving…' : editId ? 'Save Changes' : 'Log Fill-up'}
              </button>
              <button type="button" onClick={closeForm} className="btn-secondary text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Entries list ── */}
      {loading ? (
        <div className="text-raptor-muted animate-pulse text-sm">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="card p-10 text-center space-y-4">
          <svg className="w-10 h-10 text-raptor-muted mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <p className="text-raptor-secondary">No fill-ups logged yet.</p>
          <button onClick={openNew} className="btn-primary text-sm">Log First Fill-up</button>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => (
            <FuelEntryRow
              key={entry.id}
              entry={entry}
              factoryHwy={factoryMpg.hwy}
              onEdit={() => openEdit(entry)}
              onDelete={() => setDeleteTarget(entry.id)}
            />
          ))}
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Fill-up"
          message="Delete this fuel entry? This cannot be undone."
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ── Fuel Entry Row ────────────────────────────────────────────────────────────

function FuelEntryRow({ entry, factoryHwy, onEdit, onDelete }) {
  const priceStr = entry.price_per_gallon != null
    ? `$${parseFloat(entry.price_per_gallon).toFixed(3)}/gal`
    : null
  const costStr = entry.total_cost != null
    ? fmtMoney(entry.total_cost)
    : null
  const gallonsStr = entry.gallons != null
    ? `${parseFloat(entry.gallons).toFixed(3)} gal`
    : '—'

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Top row: date + odo + mpg badge */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-raptor-primary">{fmtDate(entry.date)}</span>
            <span className="text-xs text-raptor-muted">{fmtOdo(entry.odometer)}</span>
            <MpgBadge mpg={entry.mpg} factoryHwy={factoryHwy} />
            {entry.trip_type && entry.trip_type !== 'mixed' && (
              <span className="text-xs text-raptor-muted capitalize px-1.5 py-0.5 rounded bg-raptor-elevated border border-raptor-border">
                {entry.trip_type}
              </span>
            )}
            {entry.full_tank === false && (
              <span className="text-xs text-raptor-muted px-1.5 py-0.5 rounded bg-raptor-elevated border border-raptor-border">
                partial
              </span>
            )}
          </div>

          {/* Second row: gallons, price/gal, total cost */}
          <div className="flex flex-wrap gap-3 text-sm text-raptor-secondary">
            <span>{gallonsStr}</span>
            {priceStr && <span className="text-raptor-muted">{priceStr}</span>}
            {costStr && <span className="font-semibold text-raptor-accent">{costStr}</span>}
          </div>

          {/* Station + notes */}
          {entry.station && (
            <div className="text-xs text-raptor-muted">{entry.station}</div>
          )}
          {entry.notes && (
            <div className="text-sm text-raptor-secondary whitespace-pre-wrap">{entry.notes}</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="text-raptor-muted hover:text-raptor-primary p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors"
            title="Edit"
            aria-label="Edit fill-up"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="text-raptor-muted hover:text-red-500 p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors"
            title="Delete"
            aria-label="Delete fill-up"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
