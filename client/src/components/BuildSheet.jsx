import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge'

const CATEGORY_META = {
  Suspension:      { dot: 'bg-blue-500',    label: 'Suspension' },
  Tires_Wheels:    { dot: 'bg-stone-500',   label: 'Tires & Wheels' },
  Lighting:        { dot: 'bg-yellow-400',  label: 'Lighting' },
  Bumpers:         { dot: 'bg-slate-500',   label: 'Bumpers' },
  Armor:           { dot: 'bg-zinc-600',    label: 'Armor' },
  Engine:          { dot: 'bg-red-600',     label: 'Engine' },
  Performance:     { dot: 'bg-orange-500',  label: 'Performance' },
  Interior:        { dot: 'bg-purple-500',  label: 'Interior' },
  Audio:           { dot: 'bg-green-500',   label: 'Audio' },
  Electrical:      { dot: 'bg-cyan-500',    label: 'Electrical' },
  Recovery:        { dot: 'bg-red-400',     label: 'Recovery' },
  Bed_Accessories: { dot: 'bg-amber-600',   label: 'Bed Accessories' },
  Other:           { dot: 'bg-gray-400',    label: 'Other' },
}

const CATEGORY_ORDER = [
  'Suspension','Tires_Wheels','Lighting','Bumpers','Armor',
  'Engine','Performance','Electrical','Interior','Audio',
  'Recovery','Bed_Accessories','Other'
]

function fmt(cost) {
  if (cost == null) return '—'
  return '$' + parseFloat(cost).toLocaleString('en-US', { minimumFractionDigits: 2 })
}

export default function BuildSheet({ mods }) {
  const [collapsed, setCollapsed] = useState({})

  const grouped = {}
  for (const mod of mods) {
    const cat = mod.category || 'Other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(mod)
  }

  const categories = [
    ...CATEGORY_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)),
  ]

  const totalCost = mods.reduce((s, m) => s + (m.cost || 0), 0)
  const installedCost = mods.filter(m => m.status === 'Installed').reduce((s, m) => s + (m.cost || 0), 0)
  const pipelineCost = totalCost - installedCost
  const installedPct = totalCost > 0 ? Math.round((installedCost / totalCost) * 100) : 0

  if (mods.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-raptor-secondary mb-4">No mods yet. Add your first mod to start your build sheet.</p>
        <Link to="/mods/new" className="btn-primary text-sm">Add Your First Mod</Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {categories.map(cat => {
        const items = grouped[cat]
        const meta = CATEGORY_META[cat] || { dot: 'bg-gray-400', label: cat.replace('_', ' ') }
        const catCost = items.reduce((s, m) => s + (m.cost || 0), 0)
        const isCollapsed = collapsed[cat]

        return (
          <div key={cat} className="card overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-raptor-elevated transition-colors text-left"
              onClick={() => setCollapsed(p => ({ ...p, [cat]: !p[cat] }))}
            >
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${meta.dot}`} />
                <span className="font-display font-bold text-sm tracking-wide uppercase text-raptor-primary">
                  {meta.label}
                </span>
                <span className="text-xs text-raptor-muted">
                  {items.length} {items.length === 1 ? 'part' : 'parts'}
                </span>
              </div>
              <div className="flex items-center gap-4">
                {catCost > 0 && (
                  <span className="font-semibold text-sm text-raptor-primary tabular-nums">{fmt(catCost)}</span>
                )}
                <svg
                  className={`w-4 h-4 text-raptor-muted transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {!isCollapsed && (
              <div className="border-t border-raptor-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-raptor-elevated">
                      <th className="px-4 py-2 text-left text-xs font-medium text-raptor-muted uppercase tracking-wider">Part</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-raptor-muted uppercase tracking-wider hidden sm:table-cell">Brand</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-raptor-muted uppercase tracking-wider">Status</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-raptor-muted uppercase tracking-wider">Cost</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-raptor-muted uppercase tracking-wider hidden md:table-cell">Vendor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(mod => (
                      <tr key={mod.id} className="border-t border-raptor-border hover:bg-raptor-elevated transition-colors">
                        <td className="px-4 py-3">
                          <Link to={`/mods/${mod.id}`} className="hover:text-raptor-accent transition-colors">
                            <span className="font-medium text-raptor-primary">{mod.part_name}</span>
                            {mod.part_number && (
                              <span className="block text-xs text-raptor-muted mt-0.5">#{mod.part_number}</span>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-raptor-secondary hidden sm:table-cell">{mod.brand || '—'}</td>
                        <td className="px-4 py-3"><StatusBadge status={mod.status} /></td>
                        <td className="px-4 py-3 text-right font-medium text-raptor-primary tabular-nums">{fmt(mod.cost)}</td>
                        <td className="px-4 py-3 text-center hidden md:table-cell">
                          {mod.vendor_url ? (
                            <a
                              href={mod.vendor_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={mod.vendor || 'View Product'}
                              className="inline-flex items-center gap-1 text-xs text-raptor-accent hover:opacity-70 transition-opacity"
                            >
                              {mod.vendor && <span className="max-w-[120px] truncate">{mod.vendor}</span>}
                              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          ) : (
                            <span className="text-raptor-muted text-xs">{mod.vendor || '—'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-raptor-border bg-raptor-elevated">
                      <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-raptor-secondary hidden sm:table-cell">
                        {meta.label} Subtotal
                      </td>
                      <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-raptor-secondary sm:hidden">
                        Subtotal
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-raptor-primary tabular-nums">{fmt(catCost)}</td>
                      <td className="hidden md:table-cell" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {/* Grand total card */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <span className="font-display font-bold text-base tracking-widest uppercase text-raptor-secondary">Build Total</span>
          <span className="font-display font-bold text-2xl text-raptor-accent tabular-nums">{fmt(totalCost)}</span>
        </div>

        <div className="space-y-2 mb-4">
          {installedCost > 0 && (
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-raptor-secondary">Installed</span>
              </div>
              <span className="font-semibold text-raptor-primary tabular-nums">{fmt(installedCost)}</span>
            </div>
          )}
          {pipelineCost > 0 && (
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-raptor-border" />
                <span className="text-raptor-secondary">Pipeline</span>
              </div>
              <span className="font-semibold text-raptor-primary tabular-nums">{fmt(pipelineCost)}</span>
            </div>
          )}
        </div>

        {totalCost > 0 && (
          <>
            <div className="h-2 rounded-full bg-raptor-elevated overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${installedPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-raptor-muted mt-1.5">
              <span>{installedPct}% installed</span>
              <span>{mods.length} total parts</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
