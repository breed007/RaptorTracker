import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ConfirmModal from '../components/ConfirmModal'

const CheckIcon = () => (
  <svg className="w-4 h-4 text-raptor-accent flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
)

export default function Export() {
  const { selectedVehicleId, selectedVehicle } = useApp()
  const [summary, setSummary] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [includeSticker, setIncludeSticker] = useState(false)

  // Backup / restore
  const restoreInputRef = useRef(null)
  const [pendingRestoreFile, setPendingRestoreFile] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [backupMsg, setBackupMsg] = useState(null) // { type, text }

  // CSV import
  const importInputRef = useRef(null)
  const [impType, setImpType] = useState('fuel')
  const [impFile, setImpFile] = useState(null)
  const [impPreview, setImpPreview] = useState(null)
  const [impBusy, setImpBusy] = useState(false)
  const [impMsg, setImpMsg] = useState(null)

  const IMPORT_TYPES = [
    { id: 'fuel', label: 'Fuel Log' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'mods', label: 'Modifications' },
    { id: 'wishlist', label: 'Wishlist' },
    { id: 'specs', label: 'Spec Sheet' },
  ]

  const runImport = async (file, commit) => {
    if (!file || !selectedVehicleId) return
    setImpBusy(true); setImpMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', impType)
      fd.append('vehicle_id', selectedVehicleId)
      fd.append('commit', commit ? 'true' : 'false')
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
    setImpFile(f); setImpPreview(null); setImpMsg(null)
    runImport(f, false) // always dry-run first
  }

  // Scheduled backup settings
  const [bset, setBset] = useState(null)
  const [bsaving, setBsaving] = useState(false)

  useEffect(() => {
    fetch('/api/backup/settings').then(r => r.ok ? r.json() : null).then(setBset).catch(() => {})
  }, [])

  const saveBackupSettings = async (patch) => {
    setBsaving(true)
    try {
      const res = await fetch('/api/backup/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bset, ...patch }),
      })
      if (res.ok) setBset(await res.json())
    } finally { setBsaving(false) }
  }

  const runBackupNow = async () => {
    setBsaving(true); setBackupMsg(null)
    try {
      const res = await fetch('/api/backup/run', { method: 'POST' })
      const data = await res.json()
      if (res.ok) { setBset(s => ({ ...s, backups: data.backups })); setBackupMsg({ type: 'ok', text: `Saved ${data.name}` }) }
      else setBackupMsg({ type: 'err', text: data.error || 'Backup failed.' })
    } finally { setBsaving(false) }
  }

  const deleteStoredBackup = async (name) => {
    const res = await fetch(`/api/backup/file/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (res.ok) setBset(await res.json())
  }

  const fmtSize = (b) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

  const handleBackup = () => {
    const a = document.createElement('a')
    a.href = '/api/backup'
    a.download = `raptortracker-backup-${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
  }

  const handleRestorePick = (e) => {
    const file = e.target.files?.[0]
    if (file) setPendingRestoreFile(file)
  }

  const confirmRestore = async () => {
    const file = pendingRestoreFile
    setPendingRestoreFile(null)
    if (!file) return
    setRestoring(true)
    setBackupMsg(null)
    try {
      const fd = new FormData()
      fd.append('backup', file)
      const res = await fetch('/api/backup/restore', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        setBackupMsg({ type: 'ok', text: `Restore complete (${data.restoredFiles} file(s)). Reloading…` })
        setTimeout(() => window.location.reload(), 1500)
      } else {
        setBackupMsg({ type: 'err', text: data.error || 'Restore failed.' })
      }
    } catch {
      setBackupMsg({ type: 'err', text: 'Restore failed — check your connection.' })
    } finally {
      setRestoring(false)
      if (restoreInputRef.current) restoreInputRef.current.value = ''
    }
  }

  useEffect(() => {
    if (!selectedVehicleId) return
    fetch(`/api/summary?vehicle_id=${selectedVehicleId}`)
      .then(r => r.json())
      .then(setSummary)
  }, [selectedVehicleId])

  const handleExport = async () => {
    if (!selectedVehicleId) return
    setGenerating(true)
    try {
      const params = includeSticker ? '?include_sticker=true' : ''
      const res = await fetch(`/api/export/pdf/${selectedVehicleId}${params}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const nickname = selectedVehicle?.nickname?.replace(/[^a-z0-9]/gi, '-') || 'Raptor'
      const date = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `RaptorTracker-${nickname}-${date}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('PDF export failed — check server logs')
    } finally {
      setGenerating(false)
    }
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
    const date = new Date().toISOString().slice(0, 10)
    const a = document.createElement('a')
    a.href = `/api/export/csv/${type}/${selectedVehicleId}`
    a.download = `RaptorTracker-${type}-${date}.csv`
    a.click()
  }

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  const stats = summary?.stats || {}
  const installed = stats.installed || 0
  const totalSpend = stats.total_spend || 0

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">Export Build Sheet</h1>
        <p className="text-raptor-secondary text-sm mt-1">
          Generate a PDF build documentation for {selectedVehicle?.nickname || 'your vehicle'}.
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="section-title">PDF Contents</div>
        <ul className="space-y-2 text-sm text-raptor-secondary">
          {[
            'Vehicle info header (year, model, generation, color, VIN, options)',
            'Installed mods grouped by category with costs and dates',
            'Photo thumbnails (max 3 per row, 6 per mod)',
            'AUX switch map with assigned labels and factory notes',
            'Complete maintenance history',
            'Total investment summary',
          ].map(item => (
            <li key={item} className="flex items-center gap-2">
              <CheckIcon />
              {item}
            </li>
          ))}
          {includeSticker && selectedVehicle?.window_sticker && (
            <li className="flex items-center gap-2">
              <CheckIcon />
              Window sticker (final page)
            </li>
          )}
        </ul>

        {selectedVehicle?.window_sticker && (
          <label className="flex items-center gap-3 pt-2 border-t border-raptor-border cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeSticker}
              onChange={e => setIncludeSticker(e.target.checked)}
              className="w-4 h-4 accent-raptor-accent"
            />
            <span className="text-sm text-raptor-secondary">Include window sticker as final page</span>
          </label>
        )}
      </div>

      <div className="card p-5 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-raptor-muted uppercase tracking-wide">Installed Mods</div>
          <div className="text-2xl font-display font-bold text-raptor-accent mt-0.5">{installed}</div>
        </div>
        <div>
          <div className="text-xs text-raptor-muted uppercase tracking-wide">Total Spend</div>
          <div className="text-2xl font-display font-bold text-raptor-primary mt-0.5">
            ${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      <button
        onClick={handleExport}
        disabled={generating}
        className="btn-primary w-full flex items-center justify-center gap-3 py-3 text-base disabled:opacity-50"
      >
        {generating ? (
          <>
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating PDF…
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Build Sheet PDF
          </>
        )}
      </button>

      <p className="text-xs text-raptor-muted text-center">
        File: RaptorTracker-{(selectedVehicle?.nickname || 'Raptor').replace(/[^a-z0-9]/gi, '-')}-{new Date().toISOString().slice(0, 10)}.pdf
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          Bringing history from a spreadsheet or another app? Pick what you're importing and choose a
          file — nothing is written until you review the preview. Column names are matched loosely
          (<code>Odo</code>, <code>Miles</code>, and <code>Odometer</code> all work), and dates like
          <code> 12/4/25</code> are read as month-first.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">What is this?</label>
            <select
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
            ? 'border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
            : 'border border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-400'}`}>
            {impMsg.text}
          </div>
        )}

        {impPreview && impPreview.total != null && (
          <div className="rounded-lg border border-raptor-border bg-raptor-elevated p-4 space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-raptor-secondary">Rows found: <span className="text-raptor-primary font-semibold">{impPreview.total}</span></span>
              <span className="text-green-600 dark:text-green-400">Ready: <span className="font-semibold">{impPreview.validCount}</span></span>
              {impPreview.errorCount > 0 && (
                <span className="text-red-500 dark:text-red-400">Skipped: <span className="font-semibold">{impPreview.errorCount}</span></span>
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
                <div className="text-xs font-medium text-red-500 dark:text-red-400">Rows that will be skipped:</div>
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

      {/* Full backup & restore */}
      <div className="card p-5 space-y-3">
        <div className="section-title">Full Backup &amp; Restore</div>
        <p className="text-sm text-raptor-secondary">
          A complete snapshot of <strong>every vehicle</strong> — the database plus all uploaded photos,
          stickers, and attachments — in one ZIP. Keep these somewhere safe; restoring replaces all current data.
        </p>

        {backupMsg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${backupMsg.type === 'ok'
            ? 'border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
            : 'border border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-400'}`}>
            {backupMsg.text}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button onClick={handleBackup} className="btn-primary text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Backup
          </button>
          <button
            onClick={() => restoreInputRef.current?.click()}
            disabled={restoring}
            className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {restoring ? 'Restoring…' : 'Restore from Backup…'}
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleRestorePick}
          />
        </div>
      </div>

      {/* Automatic backups */}
      {bset && (
        <div className="card p-5 space-y-4">
          <div className="section-title">Automatic Backups</div>
          <p className="text-sm text-raptor-secondary">
            Write a backup to the server on a schedule and keep the most recent copies.
            Manual backups only help if you remember to take them.
          </p>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox" checked={bset.enabled}
              onChange={e => saveBackupSettings({ enabled: e.target.checked })}
              className="w-4 h-4 rounded accent-raptor-accent mt-0.5 cursor-pointer"
            />
            <span>
              <span className="text-sm font-medium text-raptor-primary">Enable nightly backups</span>
              <span className="block text-xs text-raptor-muted">Stored under <code>data/backups/</code> on the server.</span>
            </span>
          </label>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="label">Hour (0–23)</label>
              <input
                type="number" min="0" max="23" value={bset.hour}
                onChange={e => setBset(s => ({ ...s, hour: e.target.value }))}
                onBlur={e => saveBackupSettings({ hour: e.target.value })}
                className="input-field w-24"
              />
            </div>
            <div>
              <label className="label">Keep last</label>
              <input
                type="number" min="1" max="90" value={bset.keep}
                onChange={e => setBset(s => ({ ...s, keep: e.target.value }))}
                onBlur={e => saveBackupSettings({ keep: e.target.value })}
                className="input-field w-24"
              />
            </div>
            <div className="flex items-end">
              <button onClick={runBackupNow} disabled={bsaving} className="btn-secondary text-sm disabled:opacity-50">
                {bsaving ? 'Working…' : 'Back Up Now'}
              </button>
            </div>
          </div>

          {bset.backups?.length > 0 && (
            <div className="pt-2 border-t border-raptor-border">
              <div className="text-xs font-medium text-raptor-muted mb-2">Stored backups ({bset.backups.length})</div>
              <div className="space-y-1">
                {bset.backups.map(b => (
                  <div key={b.name} className="flex items-center gap-3 text-xs py-1">
                    <span className="text-raptor-secondary truncate flex-1">{b.name}</span>
                    <span className="text-raptor-muted flex-shrink-0">{fmtSize(b.size)}</span>
                    <a href={`/api/backup/file/${encodeURIComponent(b.name)}`} className="text-raptor-accent hover:underline flex-shrink-0">Download</a>
                    <button onClick={() => deleteStoredBackup(b.name)} className="text-raptor-muted hover:text-red-500 flex-shrink-0">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {pendingRestoreFile && (
        <ConfirmModal
          title="Restore from Backup"
          message={`This will REPLACE all current vehicles, records, and uploads with the contents of "${pendingRestoreFile.name}". This cannot be undone. Continue?`}
          danger
          onConfirm={confirmRestore}
          onCancel={() => { setPendingRestoreFile(null); if (restoreInputRef.current) restoreInputRef.current.value = '' }}
        />
      )}
    </div>
  )
}
