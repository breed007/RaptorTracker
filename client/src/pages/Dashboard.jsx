import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { currentUnits } from '../lib/units'
import StatsCard from '../components/StatsCard'
import SpendChart from '../components/SpendChart'
import StatusBadge from '../components/StatusBadge'
import { internalPath } from '../lib/links'
import { formatDue, monthYear } from '../lib/dates'
import { logRecallAsService } from '../lib/recalls'

const money = (v, dp = 0) => (dp === 0 ? currentUnits().money0(v) : currentUnits().money(v))

const fmtDate = (d) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const CATEGORY_ICON = {
  service: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  warranty: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  compliance: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  electrical: 'M13 10V3L4 14h7v7l9-11h-7z',
  recall: 'M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z',
}

export default function Dashboard() {
  const { selectedVehicleId, refreshVehicles } = useApp()
  const [removingSample, setRemovingSample] = useState(false)
  const removeSample = async () => {
    setRemovingSample(true)
    try {
      await fetch('/api/sample', { method: 'DELETE' })
      await refreshVehicles()
    } finally { setRemovingSample(false) }
  }
  const navigate = useNavigate()

  const [overview, setOverview] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [recalls, setRecalls] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAllAttention, setShowAllAttention] = useState(false)

  useEffect(() => {
    if (!selectedVehicleId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      fetch(`/api/overview?vehicle_id=${selectedVehicleId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/forecast?vehicle_id=${selectedVehicleId}&months=6`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([ov, fc]) => {
      setOverview(ov); setForecast(fc); setLoading(false)
    }).catch(() => setLoading(false))
  }, [selectedVehicleId])

  // Recalls hit an external API, so they load independently
  useEffect(() => {
    if (!selectedVehicleId) { setRecalls(null); return }
    setRecalls(null)
    fetch(`/api/recalls?vehicle_id=${selectedVehicleId}`)
      .then(r => r.ok ? r.json() : null).then(setRecalls).catch(() => {})
  }, [selectedVehicleId])

  const trackRecall = async (r) => {
    if (await logRecallAsService(selectedVehicleId, r)) navigate('/maintenance')
  }

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  if (loading || !overview) return <div className="text-raptor-muted animate-pulse">Loading…</div>

  const { vehicle, stats, attention, attentionSummary } = overview
  // Recalls come from NHTSA by make, model, and year — they *may* apply.
  // Only ones the owner has confirmed against their VIN are urgent; the rest
  // are a single review item, after things that are known to need doing
  // (an overdue oil change must never sit below a list of maybes).
  const confirmedRecalls = (recalls?.recalls || []).filter(r => r.state === 'applies')
  const reviewCount = recalls?.counts?.review || 0
  const confirmedItems = confirmedRecalls.map(r => ({
    severity: 'critical', category: 'recall',
    title: `Recall: ${r.title}`,
    detail: `Confirmed for your truck · NHTSA ${r.campaign} · not yet repaired`,
    recall: r, link: '/recalls',
  }))
  const reviewItem = reviewCount > 0 ? [{
    severity: 'info', category: 'recall',
    title: `${reviewCount} recall${reviewCount === 1 ? '' : 's'} may apply to ${recalls.year} ${recalls.model}s`,
    detail: 'NHTSA lists recalls by model year, not by truck. Check your VIN to see which affect yours.',
    link: '/recalls',
  }] : []
  const critical = attention.filter(a => a.severity === 'critical')
  const rest = attention.filter(a => a.severity !== 'critical')
  const allAttention = [...critical, ...confirmedItems, ...rest, ...reviewItem]
  const criticalCount = attentionSummary.critical + confirmedItems.length
  const shownAttention = showAllAttention ? allAttention : allAttention.slice(0, 6)

  const upcoming = (forecast?.items || []).filter(i => i.projectedDate && !i.overdue).slice(0, 4)

  return (
    <div className="space-y-5">
      {vehicle.is_sample && (
        <div className="card p-4 border-l-4 border-l-raptor-accent flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-raptor-secondary min-w-[14rem]">
            <span className="font-semibold text-raptor-primary">This is a sample truck.</span>{' '}
            Its records are made up so you can see how everything fits together. Add your own truck in{' '}
            <Link to="/garage" className="text-raptor-link underline underline-offset-2 hover:no-underline">My Garage</Link>, then remove this one.
          </p>
          <button type="button" onClick={removeSample} disabled={removingSample} className="btn-secondary text-sm disabled:opacity-50">
            {removingSample ? 'Removing…' : 'Remove sample truck'}
          </button>
        </div>
      )}

      {/* ── Hero ── */}
      <div className="card overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          {vehicle.profile_photo && (
            <div className="sm:w-56 h-32 sm:h-auto flex-shrink-0 bg-raptor-elevated">
              <img src={vehicle.profile_photo} alt={vehicle.nickname} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 p-5 flex flex-col justify-center">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="page-title">{vehicle.nickname}</h1>
                <p className="text-raptor-secondary text-sm mt-0.5">
                  {vehicle.model_year} {vehicle.make} {vehicle.model} — {vehicle.generation}
                  {vehicle.color ? ` · ${vehicle.color}` : ''}
                </p>
              </div>
              <Link to="/mods/new" className="btn-primary text-sm flex items-center gap-2">
                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Mod
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
              {vehicle.current_mileage != null && (
                <span className="text-raptor-secondary">
                  <span className="text-raptor-primary font-semibold">{Math.round(vehicle.current_mileage).toLocaleString()}</span> {currentUnits().dist}
                </span>
              )}
              {vehicle.milesPerMonth != null && (
                <span className="text-raptor-secondary">
                  <span className="text-raptor-primary font-semibold">{Math.round(vehicle.milesPerMonth).toLocaleString()}</span> {currentUnits().dist}/mo
                </span>
              )}
              {overview.aux && (
                <span className="text-raptor-secondary">
                  <span className="text-raptor-primary font-semibold">{overview.aux.free}</span> AUX free
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Needs attention (one list, not three cards) ── */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="section-title">Needs Attention</span>
          {criticalCount > 0 ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {criticalCount} urgent
            </span>
          ) : allAttention.length > 0 ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-500">
              {allAttention.length} upcoming
            </span>
          ) : (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              all clear
            </span>
          )}
        </div>

        {allAttention.length === 0 ? (
          <p className="text-sm text-raptor-secondary">
            Nothing overdue or expiring. Service, warranties, and registration are current, and no recalls are waiting on you.
          </p>
        ) : (
          <div className="space-y-2">
            {shownAttention.map((a, i) => {
              const critical = a.severity === 'critical'
              const info = a.severity === 'info'
              const body = (
                <div className={`px-3 py-2 rounded-lg border flex items-start gap-2.5 ${
                  critical
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/40'
                    : info
                      ? 'bg-raptor-elevated border-raptor-border'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900/40'
                }`}>
                  <svg aria-hidden="true" className={`w-4 h-4 mt-0.5 flex-shrink-0 ${critical ? 'text-red-700 dark:text-red-400' : info ? 'text-raptor-muted' : 'text-yellow-800 dark:text-yellow-500'}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={CATEGORY_ICON[a.category] || CATEGORY_ICON.service} />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${critical ? 'text-red-700 dark:text-red-400' : info ? 'text-raptor-primary' : 'text-yellow-700 dark:text-yellow-500'}`}>
                      {a.title}
                    </div>
                    {a.detail && <div className="text-xs text-raptor-secondary mt-0.5">{a.detail}</div>}
                    {a.recall && (
                      <button onClick={e => { e.preventDefault(); trackRecall(a.recall) }}
                        className="text-xs text-raptor-link underline underline-offset-2 hover:no-underline mt-1">+ Log the repair</button>
                    )}
                  </div>
                </div>
              )
              return internalPath(a.link)
                ? <Link key={i} to={internalPath(a.link)} className="block">{body}</Link>
                : <div key={i}>{body}</div>
            })}
            {allAttention.length > shownAttention.length && (
              <button onClick={() => setShowAllAttention(true)} className="text-xs text-raptor-link underline underline-offset-2 hover:no-underline">
                Show {allAttention.length - shownAttention.length} more →
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Coming up ── */}
      {upcoming.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="section-title">Coming Up</span>
            <Link to="/maintenance" className="ml-auto text-xs text-raptor-link underline underline-offset-2 hover:no-underline">Full forecast →</Link>
          </div>
          <div className="space-y-1.5">
            {upcoming.map(item => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1 min-w-0 text-raptor-primary truncate">{item.service_type}</span>
                {item.estimatedCost > 0 && <span className="text-xs text-raptor-secondary flex-shrink-0">~{money(item.estimatedCost)}</span>}
                <span className="text-xs text-raptor-muted flex-shrink-0 text-right">
                  {formatDue(item.daysOut)}{item.daysOut >= 730 && item.projectedDate ? ` (${monthYear(item.projectedDate)})` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard label="Installed" value={stats.installed || 0} sub="mods" accent />
        <StatsCard label="Mod Spend" value={money(stats.modSpend)} sub="installed mods" />
        <StatsCard label="In Transit" value={stats.inTransit || 0} sub="on the way" />
        <StatsCard label="On Order" value={stats.onOrder || 0} sub="ordered" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatsCard
          label="Maintenance Spend"
          value={stats.maintenanceSpend > 0 ? money(stats.maintenanceSpend) : '—'}
          sub={`${stats.serviceRecords} service record${stats.serviceRecords !== 1 ? 's' : ''}`}
        />
        <StatsCard
          label="Last Service"
          value={stats.lastService ? stats.lastService.service_type : '—'}
          sub={stats.lastService ? fmtDate(stats.lastService.date_performed) : 'No records yet'}
        />
      </div>

      {/* ── Spend chart ── */}
      <div className="card p-5">
        <div className="section-title mb-4">Spend by Category</div>
        <SpendChart data={overview.spendByCategory} />
      </div>

      {/* ── Recent activity ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="section-title">Recent Mods</div>
          <Link to="/mods" className="text-xs text-raptor-link underline underline-offset-2 hover:no-underline">View all →</Link>
        </div>
        {!overview.recentMods?.length ? (
          <p className="text-raptor-secondary text-sm">
            No mods yet — <Link to="/mods/new" className="text-raptor-link underline underline-offset-2 hover:no-underline">add your first one</Link>.
          </p>
        ) : (
          <div className="space-y-2">
            {overview.recentMods.map(m => (
              <Link key={m.id} to={`/mods/${m.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-raptor-elevated hover:bg-raptor-border transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-raptor-primary truncate">{m.part_name}</div>
                  <div className="text-xs text-raptor-muted mt-0.5">
                    {m.brand && <span className="mr-2">{m.brand}</span>}
                    <span>{m.category?.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                <StatusBadge status={m.status} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {overview.recentMaintenance?.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="section-title">Recent Maintenance</div>
            <Link to="/maintenance" className="text-xs text-raptor-link underline underline-offset-2 hover:no-underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {overview.recentMaintenance.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-raptor-elevated">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-raptor-primary truncate">{r.service_type}</div>
                  <div className="text-xs text-raptor-muted mt-0.5">
                    {fmtDate(r.date_performed)}
                    {r.mileage != null && <span className="ml-2">{currentUnits().fmtDist(r.mileage)}</span>}
                    {r.vendor && <span className="ml-2">· {r.vendor}</span>}
                  </div>
                </div>
                {r.cost != null && (
                  <span className="text-sm font-semibold text-raptor-secondary ml-3 flex-shrink-0">{money(r.cost, 2)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
