import React from 'react'
import { currentUnits } from '../lib/units'

const UNIT_NAMES = { mi: 'miles', km: 'kilometers', gal: 'gallons', l: 'liters' }

/** The dry-run result for a Fuelly, Drivvo, or Simply Auto export, with the choices that change it. */
export default function AppImportPreview({ preview: p, busy, opts, onChange, onImport }) {
  const u = currentUnits()
  const set = (k, v) => onChange({ ...opts, [k]: v })
  const from = p.units.from
  const converting = from.distance !== p.units.to.distance || from.volume !== p.units.to.volume

  return (
    <div className="rounded-lg border border-raptor-border bg-raptor-elevated p-4 space-y-3 text-sm">
      <div className="font-medium text-raptor-primary">{p.sourceLabel} export</div>

      {p.vehicles.length > 1 && (
        <div>
          <label className="label" htmlFor="app-import-vehicle">Which vehicle in the file?</label>
          <select id="app-import-vehicle" value={p.vehicle} disabled={busy} onChange={e => set('source_vehicle', e.target.value)} className="input-field w-full sm:w-72">
            {p.vehicles.map(v => <option key={v.key} value={v.key}>{v.name} ({v.count} record{v.count === 1 ? '' : 's'})</option>)}
          </select>
        </div>
      )}

      {p.units.detected ? (
        <p className="text-raptor-secondary">
          The file is in {UNIT_NAMES[from.distance]} and {UNIT_NAMES[from.volume]}
          {converting ? `; values will be converted to ${u.distLong} and ${u.volLong}.` : '.'}
        </p>
      ) : (
        <div>
          <label className="label" htmlFor="app-import-units">{p.sourceLabel} doesn&apos;t say which units it used. The file is in:</label>
          <select id="app-import-units" value={opts.source_units || ''} disabled={busy} onChange={e => set('source_units', e.target.value)} className="input-field w-full sm:w-72">
            <option value="">{u.distLong} and {u.volLong} (same as here)</option>
            <option value="mi-gal">miles and US gallons</option>
            <option value="km-l">kilometers and liters</option>
          </select>
        </div>
      )}

      {p.dayFirst != null && (
        <div>
          <label className="label" htmlFor="app-import-dates">Dates like 03/04/2024 mean</label>
          <select id="app-import-dates" value={opts.date_order || 'auto'} disabled={busy} onChange={e => set('date_order', e.target.value)} className="input-field w-full sm:w-72">
            <option value="auto">{p.dayFirst ? '3 April (day first) — detected' : 'March 4 (month first) — detected'}</option>
            <option value="mdy">March 4 (month first)</option>
            <option value="dmy">3 April (day first)</option>
          </select>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-green-700 dark:text-green-400">New fill-ups: <b>{p.fuelCount}</b></span>
        <span className="text-green-700 dark:text-green-400">New services: <b>{p.maintenanceCount}</b></span>
        {(p.duplicates.fuel + p.duplicates.maintenance) > 0 && (
          <span className="text-raptor-muted">Already here, skipped: {p.duplicates.fuel + p.duplicates.maintenance}</span>
        )}
        {p.skipped?.expenses > 0 && <span className="text-raptor-muted">Other expenses, not imported: {p.skipped.expenses}</span>}
        {p.errorCount > 0 && <span className="text-red-700 dark:text-red-400">Unreadable: {p.errorCount}</span>}
      </div>

      {p.errors?.length > 0 && (
        <div className="space-y-0.5 text-xs text-raptor-secondary">
          {p.errors.map((e, i) => <div key={i}>Line {e.line}{e.section ? ` (${e.section})` : ''}: {e.message}</div>)}
        </div>
      )}

      {(p.sample.fuel.length > 0 || p.sample.maintenance.length > 0) && (
        <div className="text-xs space-y-1">
          <div className="text-raptor-muted">First records as they&apos;ll be saved:</div>
          {p.sample.fuel.map((f, i) => (
            <div key={`f${i}`} className="text-raptor-secondary">
              {f.date} · {u.fmtDist(f.odometer)} · {u.fmtVol(f.gallons, 2)} · {u.money(f.total_cost)}{f.full_tank ? '' : ' · partial'}{f.missed_previous ? ' · missed previous' : ''}
            </div>
          ))}
          {p.sample.maintenance.map((m, i) => (
            <div key={`m${i}`} className="text-raptor-secondary">
              {m.date_performed} · {m.service_type}{m.mileage != null ? ` · ${u.fmtDist(m.mileage)}` : ''}{m.cost != null ? ` · ${u.money(m.cost)}` : ''}
            </div>
          ))}
        </div>
      )}

      {!p.committed && p.validCount > 0 && (
        <button type="button" onClick={onImport} disabled={busy} className="btn-primary text-sm disabled:opacity-50">
          {busy ? 'Importing…' : `Import ${p.validCount} record${p.validCount === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  )
}
