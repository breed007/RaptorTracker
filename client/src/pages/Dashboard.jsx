import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import StatsCard from '../components/StatsCard'
import SpendChart from '../components/SpendChart'
import StatusBadge from '../components/StatusBadge'

function calcIntervalStatus(interval, currentMileage) {
  const statuses = []
  if (interval.interval_miles && interval.last_mileage != null && currentMileage != null) {
    const remaining = (interval.last_mileage + interval.interval_miles) - currentMileage
    if (remaining <= 0) statuses.push('overdue')
    else if (remaining <= Math.max(interval.interval_miles * 0.1, 500)) statuses.push('due_soon')
    else statuses.push('ok')
  }
  if (interval.interval_months && interval.last_date) {
    const due = new Date(interval.last_date + 'T12:00:00')
    due.setMonth(due.getMonth() + interval.interval_months)
    const daysLeft = Math.floor((due - new Date()) / 86400000)
    if (daysLeft <= 0) statuses.push('overdue')
    else if (daysLeft <= 30) statuses.push('due_soon')
    else statuses.push('ok')
  }
  if (statuses.includes('overdue')) return 'overdue'
  if (statuses.includes('due_soon')) return 'due_soon'
  if (statuses.length === 0) return null
  return 'ok'
}

export default function Dashboard() {
  const { selectedVehicleId, selectedVehicle } = useApp()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [maintenance, setMaintenance] = useState([])
  const [intervals, setIntervals] = useState({ intervals: [], currentMileage: null })
  const [warrantySummary, setWarrantySummary] = useState(null)
  const [recalls, setRecalls] = useState(null)
  const [recallsCollapsed, setRecallsCollapsed] = useState(() => localStorage.getItem('recallsCollapsed') === 'true')
  const [showDismissedRecalls, setShowDismissedRecalls] = useState(false)
  const [loading, setLoading] = useState(true)

  const toggleRecallsCollapsed = () => {
    setRecallsCollapsed(c => { localStorage.setItem('recallsCollapsed', String(!c)); return !c })
  }

  // Turn an open recall into a tracked maintenance record so it stops being a
  // read-only dead end. Dismisses the recall since it's now on the books.
  const trackRecall = async (r) => {
    const notes = [
      r.component ? `Component: ${r.component}` : null,
      r.summary ? `\n${r.summary}` : null,
      r.remedy ? `\nRemedy: ${r.remedy}` : null,
    ].filter(Boolean).join('')
    const res = await fetch('/api/maintenance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_vehicle_id: selectedVehicleId,
        service_type: r.campaign ? `Recall ${r.campaign}` : 'Recall service',
        date_performed: new Date().toISOString().slice(0, 10),
        service_provider_type: 'dealership',
        notes,
      }),
    }).catch(() => null)
    if (res && res.ok) {
      dismissRecall(r.campaign, true)
      navigate('/maintenance')
    }
  }

  const dismissRecall = (campaign, dismiss = true) => {
    setRecalls(prev => {
      if (!prev) return prev
      const list = prev.recalls.map(r => r.campaign === campaign ? { ...r, dismissed: dismiss } : r)
      return { ...prev, recalls: list,
        activeCount: list.filter(r => !r.dismissed).length,
        dismissedCount: list.filter(r => r.dismissed).length }
    })
    fetch('/api/recalls/dismiss', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle_id: selectedVehicleId, campaign, dismiss }),
    }).catch(() => {})
  }

  useEffect(() => {
    if (!selectedVehicleId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      fetch(`/api/summary?vehicle_id=${selectedVehicleId}`).then(r => r.json()),
      fetch(`/api/maintenance?vehicle_id=${selectedVehicleId}`).then(r => r.json()),
      fetch(`/api/intervals?vehicle_id=${selectedVehicleId}`).then(r => r.json()).catch(() => ({ intervals: [], currentMileage: null })),
      fetch(`/api/warranty/summary?vehicle_id=${selectedVehicleId}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([sum, maint, intv, wsummary]) => {
      setSummary(sum)
      setMaintenance(Array.isArray(maint) ? maint : [])
      setIntervals(intv || { intervals: [], currentMileage: null })
      setWarrantySummary(wsummary)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [selectedVehicleId])

  // Recalls fetched separately — it hits an external API and may be slower
  useEffect(() => {
    if (!selectedVehicleId) { setRecalls(null); return }
    setRecalls(null)
    fetch(`/api/recalls?vehicle_id=${selectedVehicleId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setRecalls)
      .catch(() => {})
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

  const alertIntervals = (intervals.intervals || []).filter(i => {
    const s = calcIntervalStatus(i, intervals.currentMileage)
    return s === 'overdue' || s === 'due_soon'
  }).sort((a, b) => {
    const order = { overdue: 0, due_soon: 1 }
    return (order[calcIntervalStatus(a, intervals.currentMileage)] ?? 2) - (order[calcIntervalStatus(b, intervals.currentMileage)] ?? 2)
  })

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

      {/* Service Alerts */}
      {alertIntervals.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-raptor-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="section-title">Service Reminders</span>
            <Link to="/maintenance" className="ml-auto text-xs text-raptor-accent hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {alertIntervals.slice(0, 5).map(item => {
              const s = calcIntervalStatus(item, intervals.currentMileage)
              const isOverdue = s === 'overdue'
              return (
                <div key={item.id} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm ${isOverdue ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40' : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/40'}`}>
                  <span className={`font-medium ${isOverdue ? 'text-red-700 dark:text-red-400' : 'text-yellow-700 dark:text-yellow-500'}`}>
                    {item.service_type}
                  </span>
                  <span className={`text-xs font-semibold flex-shrink-0 ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-500'}`}>
                    {isOverdue ? 'Overdue' : 'Due Soon'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Warranty Alerts */}
      {warrantySummary && (warrantySummary.expired > 0 || warrantySummary.expiringSoon > 0) && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-raptor-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="section-title">Warranty Alerts</span>
            <Link to="/warranty" className="ml-auto text-xs text-raptor-accent hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {warrantySummary.expired > 0 && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40">
                <span className="font-medium text-red-700 dark:text-red-400">
                  {warrantySummary.expired} warrant{warrantySummary.expired === 1 ? 'y' : 'ies'} expired
                </span>
                <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex-shrink-0">Expired</span>
              </div>
            )}
            {warrantySummary.expiringSoon > 0 && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/40">
                <span className="font-medium text-yellow-700 dark:text-yellow-500">
                  {warrantySummary.expiringSoon} warrant{warrantySummary.expiringSoon === 1 ? 'y' : 'ies'} expiring within 90 days
                </span>
                <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-500 flex-shrink-0">Expiring Soon</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Open Recalls (NHTSA) */}
      {recalls && recalls.recalls && recalls.recalls.length > 0 && (() => {
        const active = recalls.recalls.filter(r => !r.dismissed)
        const dismissed = recalls.recalls.filter(r => r.dismissed)
        return (
          <div className="card p-4">
            <button
              onClick={toggleRecallsCollapsed}
              className="flex items-center gap-2 w-full text-left"
            >
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
              <span className="section-title">Open Recalls</span>
              {active.length > 0 ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {active.length}
                </span>
              ) : (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  all cleared
                </span>
              )}
              <span className="ml-auto text-xs text-raptor-muted">{recalls.make} {recalls.model} {recalls.year}</span>
              <svg className={`w-4 h-4 text-raptor-muted transition-transform ${recallsCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {!recallsCollapsed && (
              <div className="mt-3">
                {active.length === 0 ? (
                  <p className="text-sm text-raptor-secondary px-1">All recalls dismissed.</p>
                ) : (
                  <div className="space-y-2">
                    {active.map((r, i) => (
                      <div key={r.campaign || i} className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-red-700 dark:text-red-400">{r.component}</span>
                              {r.campaign && <span className="text-xs text-raptor-muted">#{r.campaign}</span>}
                            </div>
                            {r.summary && <p className="text-xs text-raptor-secondary mt-1 line-clamp-2">{r.summary}</p>}
                            <button
                              onClick={() => trackRecall(r)}
                              className="mt-1.5 text-xs text-raptor-accent hover:underline"
                            >
                              + Log as service
                            </button>
                          </div>
                          <button
                            onClick={() => dismissRecall(r.campaign, true)}
                            className="flex-shrink-0 text-raptor-muted hover:text-raptor-primary p-1 rounded hover:bg-raptor-elevated transition-colors"
                            title="Dismiss this recall"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Dismissed recalls (collapsible) */}
                {dismissed.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setShowDismissedRecalls(s => !s)}
                      className="text-xs text-raptor-accent hover:underline"
                    >
                      {showDismissedRecalls ? 'Hide' : 'Show'} {dismissed.length} dismissed
                    </button>
                    {showDismissedRecalls && (
                      <div className="space-y-1.5 mt-2">
                        {dismissed.map((r, i) => (
                          <div key={r.campaign || i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-raptor-elevated border border-raptor-border">
                            <span className="text-xs text-raptor-secondary flex-1 truncate">{r.component} {r.campaign && <span className="text-raptor-muted">#{r.campaign}</span>}</span>
                            <button
                              onClick={() => dismissRecall(r.campaign, false)}
                              className="text-xs text-raptor-accent hover:underline flex-shrink-0"
                            >
                              Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-raptor-muted mt-2">
                  Source: NHTSA, matched by model &amp; year. Confirm applicability against your VIN at nhtsa.gov.
                </p>
              </div>
            )}
          </div>
        )
      })()}

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
