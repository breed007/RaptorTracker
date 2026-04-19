import React from 'react'
import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge'

const CATEGORY_META = {
  Suspension:      { dot: 'bg-blue-500',    pill: 'bg-blue-500',    label: 'Suspension' },
  Tires_Wheels:    { dot: 'bg-stone-500',   pill: 'bg-stone-500',   label: 'Tires & Wheels' },
  Lighting:        { dot: 'bg-yellow-400',  pill: 'bg-yellow-400',  label: 'Lighting' },
  Bumpers:         { dot: 'bg-slate-500',   pill: 'bg-slate-500',   label: 'Bumpers' },
  Armor:           { dot: 'bg-zinc-600',    pill: 'bg-zinc-600',    label: 'Armor' },
  Engine:          { dot: 'bg-red-600',     pill: 'bg-red-600',     label: 'Engine' },
  Performance:     { dot: 'bg-orange-500',  pill: 'bg-orange-500',  label: 'Performance' },
  Interior:        { dot: 'bg-purple-500',  pill: 'bg-purple-500',  label: 'Interior' },
  Audio:           { dot: 'bg-green-500',   pill: 'bg-green-500',   label: 'Audio' },
  Electrical:      { dot: 'bg-cyan-500',    pill: 'bg-cyan-500',    label: 'Electrical' },
  Recovery:        { dot: 'bg-red-400',     pill: 'bg-red-400',     label: 'Recovery' },
  Bed_Accessories: { dot: 'bg-amber-600',   pill: 'bg-amber-600',   label: 'Bed Accessories' },
  Other:           { dot: 'bg-gray-400',    pill: 'bg-gray-400',    label: 'Other' },
}

function fmt(cost) {
  if (cost == null) return null
  return '$' + parseFloat(cost).toLocaleString('en-US', { minimumFractionDigits: 2 })
}

function groupByYearMonth(mods) {
  const groups = {}
  for (const mod of mods) {
    if (!mod.install_date) continue
    const d = new Date(mod.install_date + 'T12:00:00')
    const year = d.getFullYear()
    const monthNum = d.getMonth()
    const month = d.toLocaleString('en-US', { month: 'long' })
    const key = `${year}-${String(monthNum + 1).padStart(2, '0')}`
    if (!groups[key]) groups[key] = { year, month, key, mods: [] }
    groups[key].mods.push(mod)
  }
  return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key))
}

function ModCard({ mod, pipeline }) {
  const meta = CATEGORY_META[mod.category] || { dot: 'bg-gray-400', pill: 'bg-gray-400', label: mod.category?.replace('_', ' ') || 'Other' }
  const cost = fmt(mod.cost)

  return (
    <div className={`card p-3 ml-2 transition-colors hover:border-raptor-accent ${pipeline ? 'opacity-75' : ''}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <Link to={`/mods/${mod.id}`} className="hover:text-raptor-accent transition-colors">
            <span className="font-semibold text-raptor-primary">{mod.part_name}</span>
          </Link>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className={`inline-flex items-center text-xs font-medium text-white px-1.5 py-0.5 rounded ${meta.pill}`}>
              {meta.label}
            </span>
            {mod.brand && (
              <span className="text-xs text-raptor-muted">{mod.brand}</span>
            )}
            {mod.mileage_at_install != null && (
              <span className="text-xs text-raptor-muted">
                · {mod.mileage_at_install.toLocaleString()} mi
              </span>
            )}
            {mod.vendor_url && (
              <a
                href={mod.vendor_url}
                target="_blank"
                rel="noopener noreferrer"
                title={mod.vendor || 'View Product'}
                className="text-raptor-accent hover:opacity-70 transition-opacity"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {cost && (
            <span className="font-semibold text-sm tabular-nums text-raptor-primary">{cost}</span>
          )}
          <StatusBadge status={mod.status} />
        </div>
      </div>
    </div>
  )
}

export default function BuildTimeline({ mods }) {
  const withDates = mods
    .filter(m => m.install_date)
    .sort((a, b) => new Date(b.install_date) - new Date(a.install_date))

  const pipeline = mods.filter(m => !m.install_date && m.status !== 'Removed')

  const monthGroups = groupByYearMonth(withDates)

  // Nest month groups under years
  const yearMap = {}
  for (const g of monthGroups) {
    if (!yearMap[g.year]) yearMap[g.year] = []
    yearMap[g.year].push(g)
  }
  const years = Object.keys(yearMap).sort((a, b) => b - a)

  if (mods.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-raptor-secondary mb-4">No mods yet. Start your build to see the timeline.</p>
        <Link to="/mods/new" className="btn-primary text-sm">Add Your First Mod</Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {years.map(year => (
        <div key={year}>
          {/* Year header */}
          <div className="flex items-center gap-3 mb-5">
            <span className="font-display font-bold text-2xl text-raptor-accent tracking-wider">{year}</span>
            <div className="flex-1 h-px bg-raptor-border" />
            <span className="text-xs text-raptor-muted tabular-nums">
              {yearMap[year].reduce((s, g) => s + g.mods.length, 0)} mods
            </span>
          </div>

          <div className="space-y-5 pl-3">
            {yearMap[year].map(group => (
              <div key={group.key}>
                {/* Month label */}
                <div className="text-sm font-semibold text-raptor-secondary uppercase tracking-wider mb-2">
                  {group.month}
                </div>

                {/* Mods under this month */}
                <div className="relative space-y-2 pl-4 border-l-2 border-raptor-border">
                  {group.mods.map(mod => {
                    const meta = CATEGORY_META[mod.category] || { dot: 'bg-gray-400' }
                    return (
                      <div key={mod.id} className="relative">
                        <span className={`absolute -left-[21px] top-[14px] w-3 h-3 rounded-full border-2 border-raptor-card ${meta.dot}`} />
                        <ModCard mod={mod} />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Pipeline section — mods with no install date */}
      {pipeline.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <span className="font-display font-bold text-lg text-raptor-secondary tracking-widest uppercase">Pipeline</span>
            <div className="flex-1 h-px border-t border-dashed border-raptor-border" />
            <span className="text-xs text-raptor-muted">{pipeline.length} not yet installed</span>
          </div>

          <div className="relative space-y-2 pl-4 border-l-2 border-dashed border-raptor-border ml-3">
            {pipeline.map(mod => (
              <div key={mod.id} className="relative">
                <span className="absolute -left-[21px] top-[14px] w-3 h-3 rounded-full border-2 border-dashed border-raptor-muted bg-raptor-base" />
                <ModCard mod={mod} pipeline />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
