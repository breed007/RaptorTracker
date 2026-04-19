import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const STATUS_COLORS = {
  Installed:   'border-green-500 bg-green-50 dark:border-green-700 dark:bg-green-900/20',
  Ordered:     'border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20',
  In_Transit:  'border-amber-500 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20',
  Researching: 'border-gray-400 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/30',
  Removed:     'border-red-400 bg-red-50 dark:border-red-900 dark:bg-red-950/20',
}

const STATUS_DOT = {
  Installed:   'bg-green-500',
  Ordered:     'bg-blue-500',
  In_Transit:  'bg-amber-500',
  Researching: 'bg-gray-400',
  Removed:     'bg-red-500',
}

export default function AuxPanel() {
  const { selectedVehicleId, selectedVehicle } = useApp()
  const [mods, setMods] = useState([])
  const [auxLayout, setAuxLayout] = useState([])
  const [auxCount, setAuxCount] = useState(0)

  useEffect(() => {
    if (!selectedVehicle) return
    setAuxLayout(selectedVehicle.aux_switch_layout || [])
    setAuxCount(selectedVehicle.aux_switch_count || 0)
  }, [selectedVehicle])

  useEffect(() => {
    if (!selectedVehicleId) return
    fetch(`/api/mods?vehicle_id=${selectedVehicleId}`)
      .then(r => r.json())
      .then(setMods)
  }, [selectedVehicleId])

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  if (auxCount === 0) {
    return (
      <div className="space-y-5">
        <h1 className="page-title">AUX Switch Panel</h1>
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">⚡</div>
          <div className="text-raptor-primary font-semibold mb-2">No AUX Panel on This Vehicle</div>
          <p className="text-raptor-secondary text-sm">
            Gen 1 SVT Raptor (2010–2014) does not have an overhead AUX switch panel.
            The AUX switch panel was introduced with the Gen 2 F-150 Raptor in 2017.
          </p>
        </div>
      </div>
    )
  }

  const auxModMap = {}
  for (const mod of mods) {
    if (mod.aux_switch) auxModMap[mod.aux_switch] = mod
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">AUX Switch Panel</h1>
        {selectedVehicle && (
          <p className="text-raptor-secondary text-sm mt-0.5">
            {selectedVehicle.nickname} — {selectedVehicle.generation}
          </p>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-raptor-secondary">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500"></span>Installed</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Ordered</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span>In Transit</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400"></span>Available</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span>Factory Use (tap to reclaim)</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {auxLayout.map(slot => {
          const assignedMod = auxModMap[slot.switch_number]
          const isFactoryReserved = slot.factory_used && !assignedMod

          const slotClass = assignedMod
            ? STATUS_COLORS[assignedMod.status] || STATUS_COLORS.Researching
            : slot.factory_used
              ? 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
              : 'border-raptor-border bg-raptor-elevated'

          const dotClass = assignedMod
            ? STATUS_DOT[assignedMod.status]
            : slot.factory_used
              ? 'bg-amber-500'
              : 'bg-gray-300 dark:bg-gray-700'

          const content = (
            <div className={`card border-2 ${slotClass} p-4 transition-colors`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClass}`} />
                  <span className="text-xs font-mono font-semibold text-raptor-secondary">
                    AUX {slot.switch_number} — {slot.fuse_amps}A
                  </span>
                </div>
                {!assignedMod && !slot.factory_used && (
                  <span className="text-xs text-raptor-muted font-medium">Available</span>
                )}
              </div>

              {slot.warning_note && (
                <div className="bg-amber-50 border border-amber-300 dark:bg-amber-900/30 dark:border-amber-800 rounded px-2.5 py-1.5 mb-2">
                  <div className="flex items-start gap-1.5">
                    <span className="text-amber-600 dark:text-amber-400 text-xs mt-px">⚠</span>
                    <p className="text-xs text-amber-700 dark:text-amber-300 leading-snug">{slot.warning_note}</p>
                  </div>
                </div>
              )}

              {assignedMod ? (
                <div>
                  <div className="text-sm font-semibold text-raptor-primary truncate">{assignedMod.part_name}</div>
                  {(assignedMod.aux_label || slot.default_label) && (
                    <div className="text-xs text-raptor-secondary mt-0.5 truncate">
                      {assignedMod.aux_label || slot.default_label}
                    </div>
                  )}
                  {assignedMod.brand && (
                    <div className="text-xs text-raptor-muted mt-0.5">{assignedMod.brand}</div>
                  )}
                </div>
              ) : slot.factory_used ? (
                <div>
                  <div className="text-sm text-amber-700 dark:text-amber-400 font-medium">{slot.default_label}</div>
                  <div className="text-xs text-raptor-muted italic mt-1">Tap to assign a mod</div>
                </div>
              ) : (
                <div className="text-xs text-raptor-muted italic">No assignment — tap to add</div>
              )}
            </div>
          )

          if (assignedMod) {
            return (
              <Link key={slot.switch_number} to={`/mods/${assignedMod.id}`} className="block">
                {content}
              </Link>
            )
          }
          if (slot.factory_used) {
            // Factory-reserved but unassigned — link to new mod form, pre-populate label if slot has a warning (AUX 1)
            const auxLabel = slot.warning_note ? slot.default_label : ''
            const href = auxLabel
              ? `/mods/new?aux=${slot.switch_number}&aux_label=${encodeURIComponent(auxLabel)}`
              : `/mods/new?aux=${slot.switch_number}`
            return (
              <Link key={slot.switch_number} to={href} className="block">
                {content}
              </Link>
            )
          }
          return (
            <Link key={slot.switch_number} to={`/mods/new?aux=${slot.switch_number}`} className="block">
              {content}
            </Link>
          )
        })}
      </div>

      <p className="text-xs text-raptor-muted">
        Tap any slot to assign or edit a mod.
        {auxLayout.some(s => s.factory_used) && ' Amber slots are factory-used — tapping one will let you reclaim it for a custom accessory.'}
      </p>
    </div>
  )
}
