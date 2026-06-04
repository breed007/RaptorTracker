import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const TYPES = {
  vehicle:  { label: 'Vehicle',     dot: 'bg-purple-500', chip: 'text-purple-600 dark:text-purple-400' },
  mod:      { label: 'Mods',        dot: 'bg-raptor-accent', chip: 'text-raptor-accent' },
  service:  { label: 'Service',     dot: 'bg-blue-500', chip: 'text-blue-600 dark:text-blue-400' },
  fuel:     { label: 'Fuel',        dot: 'bg-green-500', chip: 'text-green-600 dark:text-green-400' },
  tire:     { label: 'Tires',       dot: 'bg-amber-500', chip: 'text-amber-600 dark:text-amber-400' },
  warranty: { label: 'Warranty',    dot: 'bg-teal-500', chip: 'text-teal-600 dark:text-teal-400' },
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Logbook() {
  const { selectedVehicleId } = useApp()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState({}) // type -> excluded(true means hidden)

  const fetchEvents = useCallback(() => {
    if (!selectedVehicleId) return
    setLoading(true)
    fetch(`/api/logbook?vehicle_id=${selectedVehicleId}`)
      .then(r => r.json())
      .then(d => setEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedVehicleId])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const toggle = (t) => setActive(a => ({ ...a, [t]: !a[t] }))
  const visible = events.filter(e => !active[e.type])

  // Group visible events by year for light sectioning
  const byYear = {}
  for (const e of visible) {
    const yr = (e.date || '').slice(0, 4) || 'Undated'
    ;(byYear[yr] = byYear[yr] || []).push(e)
  }
  const years = Object.keys(byYear).sort((a, b) => (a < b ? 1 : -1))

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  // Counts per type for the filter chips
  const counts = events.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc }, {})

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Logbook</h1>
        <p className="text-raptor-secondary text-sm mt-0.5">A complete history of everything done to this truck.</p>
      </div>

      {/* Type filters */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(TYPES).filter(([t]) => counts[t]).map(([t, cfg]) => (
          <button
            key={t}
            onClick={() => toggle(t)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              active[t]
                ? 'border-raptor-border text-raptor-muted opacity-50'
                : 'border-raptor-border text-raptor-secondary hover:text-raptor-primary'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            {cfg.label} <span className="text-raptor-muted">{counts[t]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-raptor-muted animate-pulse text-sm">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center text-raptor-secondary">
          {events.length === 0 ? 'No history yet — add mods, services, or fuel to build your logbook.' : 'Nothing matches the current filters.'}
        </div>
      ) : (
        <div className="space-y-6">
          {years.map(yr => (
            <div key={yr}>
              <div className="text-xs font-semibold text-raptor-muted uppercase tracking-wide mb-2">{yr}</div>
              <div className="relative pl-5 border-l border-raptor-border space-y-3">
                {byYear[yr].map((e, i) => {
                  const cfg = TYPES[e.type] || TYPES.vehicle
                  const body = (
                    <div className="card p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium ${cfg.chip}`}>{cfg.label}</span>
                        <span className="text-sm font-semibold text-raptor-primary">{e.title}</span>
                        <span className="ml-auto text-xs text-raptor-muted flex-shrink-0">{fmtDate(e.date)}</span>
                      </div>
                      {e.detail && <div className="text-xs text-raptor-secondary mt-0.5">{e.detail}</div>}
                    </div>
                  )
                  return (
                    <div key={i} className="relative">
                      <span className={`absolute -left-[1.45rem] top-3 w-2.5 h-2.5 rounded-full ring-2 ring-raptor-base ${cfg.dot}`} />
                      {e.link ? <Link to={e.link} className="block">{body}</Link> : body}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
