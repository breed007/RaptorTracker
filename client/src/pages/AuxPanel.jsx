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
  const [reclaiming, setReclaiming] = useState(null) // switch_number being reclaimed/restored
  const [capacity, setCapacity] = useState(null)

  // Instant paint from context, then corrected by the fresh fetch below
  useEffect(() => {
    if (!selectedVehicle) return
    setAuxLayout(selectedVehicle.aux_switch_layout || [])
    setAuxCount(selectedVehicle.aux_switch_count || 0)
  }, [selectedVehicle])

  // Always refetch mods AND the vehicle layout on mount / vehicle change.
  // The vehicle GET applies dismissed AUX warnings server-side, so this keeps
  // the panel in sync after mod edits and after a warning is dismissed
  // (context's copy of the layout is only loaded once at login).
  useEffect(() => {
    if (!selectedVehicleId) return
    fetch(`/api/mods?vehicle_id=${selectedVehicleId}`)
      .then(r => r.json())
      .then(setMods)
      .catch(() => {})
    fetch(`/api/user-vehicles/${selectedVehicleId}`)
      .then(r => r.ok ? r.json() : null)
      .then(v => {
        if (v) {
          setAuxLayout(v.aux_switch_layout || [])
          setAuxCount(v.aux_switch_count || 0)
        }
      })
      .catch(() => {})
    fetch(`/api/aux-capacity?vehicle_id=${selectedVehicleId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setCapacity)
      .catch(() => {})
  }, [selectedVehicleId])

  // Quick lookup of per-switch electrical load
  const capBySwitch = {}
  for (const s of capacity?.switches || []) capBySwitch[s.switch_number] = s

  // Reclaim a factory slot as a normal available switch (or restore it to factory)
  const handleReclaim = async (switchNumber, reclaim = true) => {
    setReclaiming(switchNumber)
    try {
      const res = await fetch(`/api/user-vehicles/${selectedVehicleId}/aux-reclaim`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ switch_number: switchNumber, reclaim }),
      })
      if (res.ok) {
        // Refetch the layout so the slot reflects the authoritative state
        const v = await fetch(`/api/user-vehicles/${selectedVehicleId}`).then(r => r.ok ? r.json() : null)
        if (v) setAuxLayout(v.aux_switch_layout || [])
      }
    } finally {
      setReclaiming(null)
    }
  }

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

  // Build switch→mod map from the aux_switches array (falls back to legacy aux_switch)
  const auxModMap = {} // { switch_number: { mod, label } }
  for (const mod of mods) {
    const switches = Array.isArray(mod.aux_switches) && mod.aux_switches.length > 0
      ? mod.aux_switches
      : (mod.aux_switch ? [{ switch_number: mod.aux_switch, label: mod.aux_label || '' }] : [])
    for (const sw of switches) {
      if (sw.switch_number) {
        auxModMap[sw.switch_number] = { mod, label: sw.label || '' }
      }
    }
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

      {/* Electrical capacity planning */}
      {capacity?.summary && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="section-title">Switch Capacity</span>
            {capacity.summary.over > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {capacity.summary.over} over fuse rating
              </span>
            )}
            {capacity.summary.over === 0 && capacity.summary.tight > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-500">
                {capacity.summary.tight} near capacity
              </span>
            )}
            <Link to="/wishlist" className="ml-auto text-xs text-raptor-accent hover:underline">Plan in Wishlist →</Link>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-raptor-secondary">Free switches: <span className="text-raptor-primary font-semibold">{capacity.summary.free}</span></span>
            <span className="text-raptor-secondary">In use: <span className="text-raptor-primary font-semibold">{capacity.summary.occupied}</span></span>
            {capacity.summary.spokenFor > 0 && (
              <span className="text-raptor-secondary">Planned: <span className="text-raptor-primary font-semibold">{capacity.summary.spokenFor}</span></span>
            )}
            {capacity.summary.factoryUsed > 0 && (
              <span className="text-raptor-secondary">Factory-used: <span className="text-raptor-primary font-semibold">{capacity.summary.factoryUsed}</span></span>
            )}
          </div>
          {capacity.unassigned?.length > 0 && (
            <p className="text-xs text-raptor-muted mt-2">
              {capacity.unassigned.length} wishlist item{capacity.unassigned.length === 1 ? '' : 's'} draw power but
              {capacity.unassigned.length === 1 ? " hasn't" : " haven't"} been assigned a switch yet.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {auxLayout.map(slot => {
          const cap = capBySwitch[slot.switch_number]
          const assignment = auxModMap[slot.switch_number]
          const assignedMod = assignment?.mod
          const switchLabel = assignment?.label

          const slotClass = assignedMod
            ? STATUS_COLORS[assignedMod.status] || STATUS_COLORS.Researching
            : slot.factory_used
              ? 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
              : 'border-raptor-border bg-raptor-elevated'

          const dotClass = assignedMod
            ? STATUS_DOT[assignedMod.status]
            : slot.factory_used ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-700'

          const Header = (
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
          )

          // Electrical load bar — only when there's something to say
          const load = cap && cap.fuse_amps && (cap.totalAmps > 0 || cap.unknownDraw) ? (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs mb-1 gap-2">
                <span className="text-raptor-muted">
                  {cap.totalAmps}A of {cap.fuse_amps}A
                  {cap.plannedAmps > 0 && <span className="text-raptor-accent"> · {cap.plannedAmps}A planned</span>}
                </span>
                {cap.status === 'over' && <span className="text-red-500 font-semibold flex-shrink-0">over fuse</span>}
                {cap.status === 'tight' && <span className="text-yellow-600 dark:text-yellow-500 font-semibold flex-shrink-0">near limit</span>}
                {cap.status === 'ok' && cap.unknownDraw && <span className="text-raptor-muted flex-shrink-0">draw unknown</span>}
              </div>
              <div className="h-1.5 rounded-full bg-raptor-elevated overflow-hidden">
                <div
                  className={`h-full rounded-full ${cap.status === 'over' ? 'bg-red-500' : cap.status === 'tight' ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(100, (cap.totalAmps / cap.fuse_amps) * 100)}%` }}
                />
              </div>
            </div>
          ) : null

          // CASE 1 — assigned mod: whole-card link to the mod
          if (assignedMod) {
            return (
              <Link key={slot.switch_number} to={`/mods/${assignedMod.id}`} className="block">
                <div className={`card border-2 ${slotClass} p-4 transition-colors`}>
                  {Header}
                  <div className="text-sm font-semibold text-raptor-primary truncate">{assignedMod.part_name}</div>
                  {(switchLabel || slot.default_label) && (
                    <div className="text-xs text-raptor-secondary mt-0.5 truncate">{switchLabel || slot.default_label}</div>
                  )}
                  {assignedMod.brand && <div className="text-xs text-raptor-muted mt-0.5">{assignedMod.brand}</div>}
                  {load}
                </div>
              </Link>
            )
          }

          // CASE 2 — factory slot, unassigned: explicit "assign" and "mark available" actions
          if (slot.factory_used) {
            const auxLabel = slot.default_label && slot.default_label !== 'User Available' ? slot.default_label : ''
            const assignHref = auxLabel
              ? `/mods/new?aux=${slot.switch_number}&aux_label=${encodeURIComponent(auxLabel)}`
              : `/mods/new?aux=${slot.switch_number}`
            return (
              <div key={slot.switch_number} className={`card border-2 ${slotClass} p-4`}>
                {Header}
                {slot.warning_note && (
                  <div className="bg-amber-50 border border-amber-300 dark:bg-amber-900/30 dark:border-amber-800 rounded px-2.5 py-1.5 mb-2">
                    <div className="flex items-start gap-1.5">
                      <span className="text-amber-600 dark:text-amber-400 text-xs mt-px flex-shrink-0">⚠</span>
                      <p className="text-xs text-amber-700 dark:text-amber-300 leading-snug flex-1">{slot.warning_note}</p>
                    </div>
                  </div>
                )}
                <div className="text-sm text-amber-700 dark:text-amber-400 font-medium">{slot.default_label}</div>
                <div className="text-xs text-raptor-muted mt-0.5">Factory-wired slot</div>
                {load}
                <div className="mb-3" />
                <div className="flex flex-wrap gap-2">
                  <Link to={assignHref} className="btn-primary text-xs">Assign a mod</Link>
                  <button
                    onClick={() => handleReclaim(slot.switch_number, true)}
                    disabled={reclaiming === slot.switch_number}
                    className="btn-secondary text-xs disabled:opacity-50"
                  >
                    {reclaiming === slot.switch_number ? 'Saving…' : 'Mark as available'}
                  </button>
                </div>
              </div>
            )
          }

          // CASE 3 — normal available (including reclaimed): whole-card link to add a mod
          return (
            <Link key={slot.switch_number} to={`/mods/new?aux=${slot.switch_number}`} className="block">
              <div className={`card border-2 ${slotClass} p-4 transition-colors relative`}>
                {Header}
                <div className="text-xs text-raptor-muted italic">No assignment — tap to add</div>
                {load}
                {slot.reclaimed && (
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); handleReclaim(slot.switch_number, false) }}
                    disabled={reclaiming === slot.switch_number}
                    className="absolute bottom-2 right-2 text-xs text-raptor-muted hover:text-amber-600 dark:hover:text-amber-400 underline underline-offset-2 disabled:opacity-50"
                    title="Restore the factory designation for this slot"
                  >
                    ↺ factory
                  </button>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      <p className="text-xs text-raptor-muted">
        Tap a slot to assign or edit a mod. Factory-wired slots (amber) can be assigned a mod directly, or marked as available to use like any other switch.
      </p>
    </div>
  )
}
