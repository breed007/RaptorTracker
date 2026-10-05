import React, { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { localDate } from '../../lib/dates'
import { currentUnits } from '../../lib/units'
import AppImportPreview from '../../components/AppImportPreview'

export default function DataSettings() {
  const { selectedVehicleId, selectedVehicle } = useApp()

  // CSV import
  const importInputRef = useRef(null)
  const [impType, setImpType] = useState('fuel')
  const [impFile, setImpFile] = useState(null)
  const [impPreview, setImpPreview] = useState(null)
  const [impBusy, setImpBusy] = useState(false)
  const [impMsg, setImpMsg] = useState(null)
  // Choices for an export from another app: which of its vehicles, its units, its date order.
  const [appOpts, setAppOpts] = useState({})

  const IMPORT_TYPES = [
    { id: 'app', label: 'Fuelly, Drivvo, or Simply Auto export' },
    { id: 'fuel', label: 'Fuel Log' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'mods', label: 'Modifications' },
    { id: 'wishlist', label: 'Wishlist' },
    { id: 'specs', label: 'Spec Sheet' },
  ]

  const runImport = async (file, commit, opts = appOpts) => {
    if (!file || !selectedVehicleId) return
    setImpBusy(true); setImpMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', impType)
      fd.append('vehicle_id', selectedVehicleId)
      fd.append('commit', commit ? 'true' : 'false')
      for (const [k, v] of Object.entries(opts)) if (v) fd.append(k, v)
      const res = await fetch('/api/import/csv', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setImpMsg({ type: 'err', text: data.error || 'Import failed.' }); setImpPreview(data.total != null ? data : null); return }
      setImpPreview(data)
      if (data.committed) {
        setImpMsg({ type: 'ok', text: `Imported ${data.inserted} row(s).` })
        setImpFile(null)
        if (importInputRef.current) importInputRef.current.value = ''
      }
    } catch {
      setImpMsg({ type: 'err', text: 'Import failed — check your connection.' })
    } finally { setImpBusy(false) }
  }

  const onImportPick = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setImpFile(f); setImpPreview(null); setImpMsg(null); setAppOpts({})
    runImport(f, false, {}) // always dry-run first
  }

  const csvTypes = [
    { type: 'mods', label: 'Modifications' },
    { type: 'maintenance', label: 'Maintenance' },
    { type: 'fuel', label: 'Fuel Log' },
    { type: 'warranties', label: 'Warranties' },
    { type: 'tires', label: 'Tire Sets' },
    { type: 'wishlist', label: 'Wishlist' },
    { type: 'specs', label: 'Spec Sheet' },
  ]

  const handleCsv = (type) => {
    if (!selectedVehicleId) return
    const date = localDate()
    const a = document.createElement('a')
    a.href = `/api/export/csv/${type}/${selectedVehicleId}`
    a.download = `RaptorTracker-${type}-${date}.csv`
    a.click()
  }

  if (!selectedVehicleId) {
    return (
      <div className="card p-6 text-center space-y-3">
        <p className="text-raptor-secondary text-sm">Import and export work on one vehicle at a time.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-raptor-secondary">
        Records for <span className="font-medium text-raptor-primary">{selectedVehicle?.nickname}</span>. Switch trucks with the selector in the sidebar.
      </p>

      {/* CSV export */}
      <div className="card p-5 space-y-3">
        <div className="section-title">Export Records as CSV</div>
        <p className="text-sm text-raptor-secondary">
          Download spreadsheet-ready CSV files for any record type — useful for taxes, resale, or your own analysis.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {csvTypes.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => handleCsv(type)}
              className="btn-secondary text-sm flex items-center justify-center gap-2"
            >
              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* CSV import */}
      <div className="card p-5 space-y-3">
        <div className="section-title">Import from CSV</div>
        <p className="text-sm text-raptor-secondary">
          Moving from Fuelly, Drivvo, or Simply Auto? Export from the app and choose the file here;
          it&apos;s recognized automatically, fill-ups and services both. For your own spreadsheet, pick
          what it holds. Nothing is written until you review the preview.
        </p>
        <p className="text-xs text-raptor-muted">
          Spreadsheet columns are matched loosely (<code>Odo</code>, <code>Miles</code>, and <code>Odometer</code> all
          work), dates like <code>12/4/25</code> are read as month-first, and distances and volumes are read as{' '}
          {currentUnits().distLong} and {currentUnits().volLong}, the units this install uses.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="data-imptype" className="label">What is this?</label>
            <select id="data-imptype"
              value={impType}
              onChange={e => { setImpType(e.target.value); setImpPreview(null); setImpFile(null); setImpMsg(null); if (importInputRef.current) importInputRef.current.value = '' }}
              className="input-field w-44"
            >
              {IMPORT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <button onClick={() => importInputRef.current?.click()} disabled={impBusy} className="btn-secondary text-sm disabled:opacity-50">
            {impBusy ? 'Reading…' : 'Choose CSV…'}
          </button>
          <input ref={importInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={onImportPick} />
          {impFile && <span className="text-xs text-raptor-muted">{impFile.name}</span>}
        </div>

        {impMsg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${impMsg.type === 'ok'
            ? 'border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
            : 'border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'}`}>
            {impMsg.text}
          </div>
        )}

        {impPreview?.mode === 'app' && (
          <AppImportPreview
            preview={impPreview} busy={impBusy} opts={appOpts}
            onChange={(next) => { setAppOpts(next); runImport(impFile, false, next) }}
            onImport={() => runImport(impFile, true)}
          />
        )}

        {impPreview && impPreview.mode !== 'app' && impPreview.total != null && (
          <div className="rounded-lg border border-raptor-border bg-raptor-elevated p-4 space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-raptor-secondary">Rows found: <span className="text-raptor-primary font-semibold">{impPreview.total}</span></span>
              <span className="text-green-700 dark:text-green-400">Ready: <span className="font-semibold">{impPreview.validCount}</span></span>
              {impPreview.errorCount > 0 && (
                <span className="text-red-700 dark:text-red-400">Skipped: <span className="font-semibold">{impPreview.errorCount}</span></span>
              )}
            </div>

            {Object.keys(impPreview.matchedColumns || {}).length > 0 && (
              <div className="text-xs text-raptor-secondary">
                <span className="text-raptor-muted">Matched columns: </span>
                {Object.entries(impPreview.matchedColumns).map(([f, h]) => `${h} → ${f}`).join(', ')}
              </div>
            )}
            {impPreview.unmatchedColumns?.length > 0 && (
              <div className="text-xs text-raptor-muted">Ignored columns: {impPreview.unmatchedColumns.join(', ')}</div>
            )}

            {impPreview.errors?.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-red-700 dark:text-red-400">Rows that will be skipped:</div>
                {impPreview.errors.map((e, i) => (
                  <div key={i} className="text-xs text-raptor-secondary">Line {e.line}: {e.message}</div>
                ))}
              </div>
            )}

            {impPreview.sample?.length > 0 && (
              <div className="text-xs">
                <div className="text-raptor-muted mb-1">First rows as they'll be saved:</div>
                <pre className="overflow-x-auto text-raptor-secondary bg-raptor-card border border-raptor-border rounded p-2">
{impPreview.sample.map(r => JSON.stringify(r)).join('\n')}
                </pre>
              </div>
            )}

            {!impPreview.committed && impPreview.validCount > 0 && (
              <button onClick={() => runImport(impFile, true)} disabled={impBusy} className="btn-primary text-sm disabled:opacity-50">
                {impBusy ? 'Importing…' : `Import ${impPreview.validCount} row${impPreview.validCount === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
