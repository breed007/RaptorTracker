import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import StatsCard from '../components/StatsCard'
import SpendChart from '../components/SpendChart'
import StatusBadge from '../components/StatusBadge'

export default function Dashboard() {
  const { selectedVehicleId, selectedVehicle } = useApp()
  const [summary, setSummary] = useState(null)
  const [maintenance, setMaintenance] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedVehicleId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      fetch(`/api/summary?vehicle_id=${selectedVehicleId}`).then(r => r.json()),
      fetch(`/api/maintenance?vehicle_id=${selectedVehicleId}`).then(r => r.json()),
    ]).then(([sum, maint]) => {
      setSummary(sum)
      setMaintenance(Array.isArray(maint) ? maint : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [selectedVehicleId])

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  if (loading) return <div className="text-raptor-muted animate-pulse">Loading…</div>

  const stats = summary?.stats || {}
  const totalSpend = stats.total_spend || 0
  const maintTotal = maintenance.reduce((s, r) => s + (r.cost || 0), 0)
  const lastService = maintenance[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">{selectedVehicle?.nickname || 'Dashboard'}</h1>
          {selectedVehicle && (
            <p className="text-raptor-secondary text-sm mt-0.5">
              {selectedVehicle.model_year} {selectedVehicle.make} {selectedVehicle.model} — {selectedVehicle.generation}
            </p>
          )}
        </div>
        <Link to="/mods/new" className="btn-primary text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Mod
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard label="Installed" value={stats.installed || 0} sub="mods" accent />
        <StatsCard
          label="Mod Spend"
          value={`$${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          sub="installed mods"
        />
        <StatsCard label="In Transit" value={stats.in_transit || 0} sub="on the way" />
        <StatsCard label="On Order"   value={stats.ordered || 0}    sub="ordered" />
      </div>

      {/* Maintenance summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatsCard
          label="Maintenance Spend"
          value={maintTotal > 0 ? `$${maintTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'}
          sub={`${maintenance.length} service record${maintenance.length !== 1 ? 's' : ''}`}
        />
        <StatsCard
          label="Last Service"
          value={lastService ? lastService.service_type : '—'}
          sub={lastService ? new Date(lastService.date_performed + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No records yet'}
        />
      </div>

      {/* Spend chart */}
      <div className="card p-5">
        <div className="section-title mb-4">Spend by Category</div>
        <SpendChart data={summary?.byCategory} />
      </div>

      {/* Recent mods */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="section-title">Recent Mods</div>
          <Link to="/mods" className="text-xs text-raptor-accent hover:underline">View all →</Link>
        </div>
        {!summary?.recent?.length ? (
          <p className="text-raptor-secondary text-sm">
            No mods yet — <Link to="/mods/new" className="text-raptor-accent hover:underline">add your first one</Link>.
          </p>
        ) : (
          <div className="space-y-2">
            {summary.recent.map(m => (
              <Link
                key={m.id}
                to={`/mods/${m.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-raptor-elevated hover:bg-raptor-border transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-raptor-primary truncate">{m.part_name}</div>
                  <div className="text-xs text-raptor-muted mt-0.5">
                    {m.brand && <span className="mr-2">{m.brand}</span>}
                    <span>{m.category?.replace('_', ' ')}</span>
                  </div>
                </div>
                <StatusBadge status={m.status} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent maintenance */}
      {maintenance.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="section-title">Recent Maintenance</div>
            <Link to="/maintenance" className="text-xs text-raptor-accent hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {maintenance.slice(0, 4).map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-raptor-elevated">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-raptor-primary truncate">{r.service_type}</div>
                  <div className="text-xs text-raptor-muted mt-0.5">
                    {new Date(r.date_performed + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {r.mileage != null && <span className="ml-2">{r.mileage.toLocaleString()} mi</span>}
                    {r.vendor && <span className="ml-2">· {r.vendor}</span>}
                  </div>
                </div>
                {r.cost != null && (
                  <span className="text-sm font-semibold text-raptor-secondary ml-3 flex-shrink-0">
                    ${parseFloat(r.cost).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
