import React, { useEffect, useRef, useState } from 'react'
import ConfirmModal from '../../components/ConfirmModal'
import { localDate } from '../../lib/dates'
import { toast } from '../../lib/toast'
import OffsiteBackupCard from '../../components/OffsiteBackupCard'

const fmtSize = (b) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

export default function BackupSettings() {
  // Backup / restore
  const restoreInputRef = useRef(null)
  const [pendingRestoreFile, setPendingRestoreFile] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [backupMsg, setBackupMsg] = useState(null) // { type, text }

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
      if (res.ok) {
        setBset(s => ({ ...s, backups: data.backups }))
        const off = data.offsite
        setBackupMsg(off && !off.skipped && !off.ok
          ? { type: 'err', text: `Saved ${data.name}, but the off-box copy failed: ${off.error}` }
          : { type: 'ok', text: `Saved ${data.name}${off?.ok ? ' and sent a copy off-box' : ''}.` })
      }
      else setBackupMsg({ type: 'err', text: data.error || 'Backup failed.' })
    } finally { setBsaving(false) }
  }

  const deleteStoredBackup = async (name) => {
    const res = await fetch(`/api/backup/file/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (res.ok) setBset(await res.json())
  }

  const handleBackup = () => {
    const a = document.createElement('a')
    a.href = '/api/backup'
    a.download = `raptortracker-backup-${localDate()}.zip`
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

  // Disk use, and uploaded files no record points at any more
  const [storage, setStorage] = useState(null)
  const [cleaning, setCleaning] = useState(false)
  const loadStorage = () => fetch('/api/storage').then(r => (r.ok ? r.json() : null)).then(setStorage).catch(() => {})
  useEffect(() => { loadStorage() }, [])
  const cleanOrphans = async () => {
    setCleaning(true)
    try {
      const res = await fetch('/api/storage/clean', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) toast(`Removed ${data.removed} unused file${data.removed === 1 ? '' : 's'}.`, { tone: 'success' })
      else toast(data.error || 'Cleanup failed.', { tone: 'error' })
      loadStorage()
    } finally { setCleaning(false) }
  }

  return (
    <div className="space-y-5">
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
              <span className="block text-xs text-raptor-muted">Stored under <code>data/backups/</code> on the server, and sent off-box if that's set up below.</span>
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

      <OffsiteBackupCard />

      {storage && (
        <div className="card p-5 space-y-3">
          <div className="section-title">Storage</div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><div className="text-xs text-raptor-muted">Database</div><div className="text-raptor-primary font-semibold">{fmtSize(storage.database)}</div></div>
            <div><div className="text-xs text-raptor-muted">Photos &amp; files</div><div className="text-raptor-primary font-semibold">{fmtSize(storage.uploads)}</div></div>
            <div><div className="text-xs text-raptor-muted">Backups</div><div className="text-raptor-primary font-semibold">{fmtSize(storage.backups)}</div></div>
          </div>
          {storage.orphans.count > 0 ? (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-raptor-border">
              <p className="text-sm text-raptor-secondary flex-1">
                {storage.orphans.count} uploaded file{storage.orphans.count === 1 ? '' : 's'} ({fmtSize(storage.orphans.bytes)}) no longer belong to any record.
              </p>
              <button onClick={cleanOrphans} disabled={cleaning} className="btn-secondary text-sm disabled:opacity-50">
                {cleaning ? 'Removing…' : 'Remove unused files'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-raptor-muted pt-2 border-t border-raptor-border">Every uploaded file belongs to a record.</p>
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
