import React, { useEffect, useState } from 'react'

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([])
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    fetch('/api/vehicles').then(r => r.json()).then(setVehicles)
  }, [])

  const toggle = (id) => setExpanded(prev => prev === id ? null : id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Raptor Reference</h1>
        <p className="text-raptor-muted text-sm mt-1">Factory specs for the complete Ford Raptor lineup — read-only reference data.</p>
      </div>

      <div className="space-y-3">
        {vehicles.map(v => (
          <div key={v.id} className="card overflow-hidden">
            <button
              onClick={() => toggle(v.id)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-raptor-elevated transition-colors"
            >
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-raptor-primary font-bold">{v.make} {v.model}</span>
                  <span className="bg-ford-navy/10 dark:bg-raptor-orange/15 text-raptor-accent text-xs font-medium px-2 py-0.5 rounded">{v.generation}</span>
                  {v.variant && <span className="text-raptor-secondary text-sm">{v.variant}</span>}
                </div>
                <div className="text-raptor-muted text-sm mt-0.5">
                  {v.model_year_start}–{v.model_year_end || 'present'}
                  {v.horsepower && <span className="ml-3">{v.horsepower} hp</span>}
                  {v.torque && <span className="ml-2">/ {v.torque} lb-ft</span>}
                </div>
              </div>
              <svg
                className={`w-5 h-5 text-raptor-muted transition-transform ${expanded === v.id ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expanded === v.id && (
              <div className="px-5 pb-5 border-t border-raptor-border space-y-5 pt-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Spec label="Years"       value={`${v.model_year_start}–${v.model_year_end || 'present'}`} />
                  <Spec label="Peak Power"  value={v.horsepower ? `${v.horsepower} hp` : '—'} />
                  <Spec label="Peak Torque" value={v.torque ? `${v.torque} lb-ft` : '—'} />
                  <Spec label="Tires"       value={v.tire_size || '—'} />
                  <Spec label="AUX Switches" value={v.aux_switch_count === 0 ? 'None' : v.aux_switch_count} />
                </div>

                {v.engine_options && v.engine_options.length > 0 && (
                  <div>
                    <div className="section-title mb-2">Engine Options</div>
                    <div className="space-y-1.5">
                      {v.engine_options.map((e, i) => (
                        <div key={i} className="flex items-start gap-3 text-sm">
                          <span className="text-raptor-primary font-medium min-w-0 flex-1">{e.name}</span>
                          <span className="text-raptor-secondary text-xs whitespace-nowrap">
                            {e.hp && `${e.hp} hp`}
                            {e.torque && ` / ${e.torque} lb-ft`}
                            {e.years && <span className="ml-2 text-raptor-muted">{e.years}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {v.suspension_notes && (
                  <div>
                    <div className="section-title mb-1">Suspension</div>
                    <p className="text-sm text-raptor-secondary">{v.suspension_notes}</p>
                  </div>
                )}

                {v.aux_switch_count === 0 ? (
                  <div className="bg-raptor-elevated border border-raptor-border rounded-lg px-4 py-3 text-sm text-raptor-secondary">
                    Gen 1 SVT Raptor does not have an overhead AUX switch panel.
                  </div>
                ) : v.aux_switch_layout && v.aux_switch_layout.length > 0 ? (
                  <div>
                    <div className="section-title mb-2">AUX Switch Layout</div>
                    <div className="space-y-1.5">
                      {v.aux_switch_layout.map(slot => (
                        <div key={slot.switch_number} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                          <span className="text-raptor-muted text-xs font-mono w-28 flex-shrink-0">
                            AUX {slot.switch_number} — {slot.fuse_amps}A
                          </span>
                          <span className={`text-sm ${slot.factory_used ? 'text-amber-600 dark:text-amber-400' : 'text-raptor-primary'}`}>
                            {slot.default_label}
                          </span>
                          {slot.warning_note && (
                            <span className="text-xs text-amber-600 dark:text-amber-500 ml-1">⚠ Reclaim required</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {v.notes && (
                  <div>
                    <div className="section-title mb-1">Notes</div>
                    <p className="text-sm text-raptor-secondary">{v.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Spec({ label, value }) {
  return (
    <div>
      <div className="text-xs text-raptor-muted font-medium">{label}</div>
      <div className="text-sm text-raptor-primary mt-0.5">{value}</div>
    </div>
  )
}
