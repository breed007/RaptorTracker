import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ConfirmModal from '../components/ConfirmModal'
import Lightbox from '../components/Lightbox'

// ── Interval status helpers ──────────────────────────────────────────────────

function calcIntervalStatus(interval, lastDate, lastMileage, currentMileage) {
  const statuses = []

  if (interval.interval_miles && lastMileage != null && currentMileage != null) {
    const dueMi = lastMileage + interval.interval_miles
    const remaining = dueMi - currentMileage
    if (remaining <= 0) statuses.push('overdue')
    else if (remaining <= Math.max(interval.interval_miles * 0.1, 500)) statuses.push('due_soon')
    else statuses.push('ok')
  }

  if (interval.interval_months && lastDate) {
    const due = new Date(lastDate + 'T12:00:00')
    due.setMonth(due.getMonth() + interval.interval_months)
    const daysLeft = Math.floor((due - new Date()) / 86400000)
    if (daysLeft <= 0) statuses.push('overdue')
    else if (daysLeft <= 30) statuses.push('due_soon')
    else statuses.push('ok')
  }

  if (statuses.includes('overdue')) return 'overdue'
  if (statuses.includes('due_soon')) return 'due_soon'
  if (statuses.length === 0) return 'never'
  return 'ok'
}

function IntervalStatusBadge({ status }) {
  const cfg = {
    overdue:  { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',    label: 'Overdue' },
    due_soon: { cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', label: 'Due Soon' },
    ok:       { cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',    label: 'OK' },
    never:    { cls: 'bg-raptor-elevated text-raptor-muted', label: 'Never Logged' },
  }[status] || { cls: 'bg-raptor-elevated text-raptor-muted', label: '—' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function fmtInterval(miles, months) {
  const parts = []
  if (miles) parts.push(`${miles.toLocaleString()} mi`)
  if (months) parts.push(`${months} mo`)
  return parts.length ? `Every ${parts.join(' or ')}` : '—'
}

// ── ServiceIntervals component ───────────────────────────────────────────────

function ServiceIntervals({ vehicleId }) {
  const [data, setData]           = useState(null)       // { intervals, currentMileage }
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState(false)
  const [editItem, setEditItem]   = useState(null)       // interval being edited, or {} for new
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [mileageEdit, setMileageEdit] = useState(false)
  const [mileageVal, setMileageVal]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState({ service_type: '', interval_miles: '', interval_months: '', notes: '' })
  const [loadingFactory, setLoadingFactory] = useState(false)

  const fetchIntervals = useCallback(() => {
    if (!vehicleId) return
    fetch(`/api/intervals?vehicle_id=${vehicleId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [vehicleId])

  useEffect(() => { setLoading(true); fetchIntervals() }, [fetchIntervals])

  const handleLoadFactory = async () => {
    setLoadingFactory(true)
    await fetch('/api/intervals/load-factory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle_id: vehicleId })
    })
    fetchIntervals()
    setLoadingFactory(false)
    setExpanded(true)
  }

  const handleSaveMileage = async () => {
    setSaving(true)
    await fetch('/api/intervals/mileage', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle_id: vehicleId, current_mileage: mileageVal ? parseInt(mileageVal) : null })
    })
    fetchIntervals()
    setSaving(false)
    setMileageEdit(false)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({
      service_type: item.service_type || '',
      interval_miles: item.interval_miles ?? '',
      interval_months: item.interval_months ?? '',
      notes: item.notes || '',
    })
  }

  const handleSaveInterval = async (e) => {
    e.preventDefault()
    setSaving(true)
    const payload = {
      user_vehicle_id: vehicleId,
      service_type: form.service_type,
      interval_miles: form.interval_miles !== '' ? parseInt(form.interval_miles) : null,
      interval_months: form.interval_months !== '' ? parseInt(form.interval_months) : null,
      notes: form.notes || null,
    }
    if (editItem?.id) {
      await fetch(`/api/intervals/${editItem.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    } else {
      await fetch('/api/intervals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    }
    fetchIntervals()
    setEditItem(null)
    setSaving(false)
  }

  const handleDelete = async () => {
    await fetch(`/api/intervals/${deleteTarget}`, { method: 'DELETE' })
    fetchIntervals()
    setDeleteTarget(null)
  }

  const intervals = data?.intervals || []
  const currentMileage = data?.currentMileage

  const overdue  = intervals.filter(i => calcIntervalStatus(i, i.last_date, i.last_mileage, currentMileage) === 'overdue')
  const dueSoon  = intervals.filter(i => calcIntervalStatus(i, i.last_date, i.last_mileage, currentMileage) === 'due_soon')

  return (
    <div className="card overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-raptor-elevated transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-raptor-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="section-title">Reminders &amp; Service Intervals</span>
          {!loading && (overdue.length > 0 || dueSoon.length > 0) && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${overdue.length > 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
              {overdue.length > 0 ? `${overdue.length} overdue` : `${dueSoon.length} due soon`}
            </span>
          )}
        </div>
        <svg className={`w-4 h-4 text-raptor-muted transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-raptor-border">
          {/* Toolbar */}
          <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-raptor-border bg-raptor-elevated/40">
            {/* Current mileage */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-raptor-muted">Current mileage:</span>
              {mileageEdit ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={mileageVal}
                    onChange={e => setMileageVal(e.target.value)}
                    className="input-field w-28 text-sm py-1 px-2"
                    placeholder="e.g. 24500"
                  />
                  <button onClick={handleSaveMileage} disabled={saving} className="btn-primary text-xs py-1 px-2">Save</button>
                  <button onClick={() => setMileageEdit(false)} className="btn-secondary text-xs py-1 px-2">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => { setMileageVal(currentMileage ?? ''); setMileageEdit(true) }}
                  className="text-xs font-semibold text-raptor-accent hover:underline"
                >
                  {currentMileage ? `${currentMileage.toLocaleString()} mi` : 'Set mileage'}
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleLoadFactory}
                disabled={loadingFactory}
                className="btn-secondary text-xs flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {loadingFactory ? 'Loading…' : 'Load Ford Factory Defaults'}
              </button>
              <button
                onClick={() => openEdit({})}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Custom
              </button>
            </div>
          </div>

          {/* Add/Edit form */}
          {editItem !== null && (
            <div className="px-5 py-4 border-b border-raptor-border bg-raptor-elevated/30">
              <div className="text-xs font-semibold text-raptor-muted uppercase tracking-wide mb-3">
                {editItem?.id ? 'Edit Interval' : 'New Custom Interval'}
              </div>
              <form onSubmit={handleSaveInterval} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="label">Service Type *</label>
                  <input type="text" value={form.service_type} onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))} className="input-field" required placeholder="e.g. Diff Fluid" />
                </div>
                <div>
                  <label className="label">Every (miles)</label>
                  <input type="number" value={form.interval_miles} onChange={e => setForm(f => ({ ...f, interval_miles: e.target.value }))} className="input-field" placeholder="e.g. 10000" />
                </div>
                <div>
                  <label className="label">Every (months)</label>
                  <input type="number" value={form.interval_months} onChange={e => setForm(f => ({ ...f, interval_months: e.target.value }))} className="input-field" placeholder="e.g. 12" />
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <label className="label">Notes</label>
                  <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input-field" placeholder="Optional notes or product recommendation" />
                </div>
                <div className="col-span-2 sm:col-span-4 flex gap-2">
                  <button type="submit" disabled={saving} className="btn-primary text-xs">{saving ? 'Saving…' : editItem?.id ? 'Save' : 'Add'}</button>
                  <button type="button" onClick={() => setEditItem(null)} className="btn-secondary text-xs">Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Intervals table */}
          {loading ? (
            <div className="px-5 py-6 text-raptor-muted animate-pulse text-sm">Loading…</div>
          ) : intervals.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-raptor-secondary text-sm mb-3">No intervals configured yet.</p>
              <button onClick={handleLoadFactory} disabled={loadingFactory} className="btn-primary text-sm">
                Load Ford Factory Defaults
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-raptor-border">
                    <th className="text-left px-5 py-2 text-xs text-raptor-muted font-medium">Service</th>
                    <th className="text-left px-3 py-2 text-xs text-raptor-muted font-medium hidden sm:table-cell">Interval</th>
                    <th className="text-left px-3 py-2 text-xs text-raptor-muted font-medium hidden md:table-cell">Last Done</th>
                    <th className="text-left px-3 py-2 text-xs text-raptor-muted font-medium">Status</th>
                    <th className="px-3 py-2 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {intervals.map(item => {
                    const status = calcIntervalStatus(item, item.last_date, item.last_mileage, currentMileage)
                    const lastDoneStr = item.last_date
                      ? new Date(item.last_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'
                    return (
                      <tr key={item.id} className="border-b border-raptor-border last:border-0 hover:bg-raptor-elevated/40 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-medium text-raptor-primary">{item.service_type}</div>
                          {item.is_factory ? <span className="text-xs text-raptor-muted">Ford factory</span> : <span className="text-xs text-raptor-muted">Custom</span>}
                          {item.notes ? <div className="text-xs text-raptor-muted mt-0.5 sm:hidden">{fmtInterval(item.interval_miles, item.interval_months)}</div> : null}
                        </td>
                        <td className="px-3 py-3 text-raptor-secondary hidden sm:table-cell">
                          {fmtInterval(item.interval_miles, item.interval_months)}
                        </td>
                        <td className="px-3 py-3 text-raptor-secondary hidden md:table-cell">
                          {lastDoneStr}
                          {item.last_mileage && <div className="text-xs text-raptor-muted">{item.last_mileage.toLocaleString()} mi</div>}
                        </td>
                        <td className="px-3 py-3">
                          <IntervalStatusBadge status={status} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => openEdit(item)} className="text-raptor-muted hover:text-raptor-primary p-1.5 rounded hover:bg-raptor-elevated transition-colors" title="Edit">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => setDeleteTarget(item.id)} className="text-raptor-muted hover:text-red-500 p-1.5 rounded hover:bg-raptor-elevated transition-colors" title="Delete">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Interval"
          message="Remove this service interval? This won't delete any maintenance records."
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

const SERVICE_TYPES = [
  'Oil Change', 'Tire Rotation', 'Air Filter (Engine)', 'Air Filter (Cabin)',
  'Diff Fluid', 'Transfer Case Fluid', 'Brake Service', 'Alignment',
  'Wheel Balance', 'Spark Plugs', 'Battery', 'Coolant Flush',
  'Transmission Fluid', 'Brake Fluid', 'Fuel Filter', 'Custom'
]

const EMPTY_FORM = {
  service_type: '', custom_type: '', date_performed: '', mileage: '', cost: '', vendor: '', notes: ''
}

function AttachmentThumb({ src, onRemove }) {
  const isPdf = src.toLowerCase().endsWith('.pdf')
  const filename = src.split('/').pop()
  return (
    <div className="relative group rounded-lg overflow-hidden border border-raptor-border bg-raptor-elevated flex-shrink-0">
      {isPdf ? (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center w-20 h-20 gap-1 text-raptor-muted hover:text-raptor-accent transition-colors p-1"
          title={filename}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs truncate w-full text-center px-1">PDF</span>
        </a>
      ) : (
        <img src={src} alt="" className="w-20 h-20 object-cover" />
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs hover:bg-red-700"
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </div>
  )
}

export default function Maintenance() {
  const { selectedVehicleId } = useApp()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Attachment state
  const attachInputRef = useRef(null)
  const [attachTarget, setAttachTarget] = useState(null)
  const [uploading, setUploading] = useState(null)
  const [attachError, setAttachError] = useState('')
  const [lightbox, setLightbox] = useState(null) // { photos, index }

  const fetchRecords = () => {
    if (!selectedVehicleId) return
    setLoading(true)
    fetch(`/api/maintenance?vehicle_id=${selectedVehicleId}`)
      .then(r => r.json())
      .then(data => { setRecords(data); setLoading(false) })
  }

  useEffect(() => { fetchRecords() }, [selectedVehicleId])

  const openNew = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  const openEdit = (record) => {
    setEditId(record.id)
    const isCustom = !SERVICE_TYPES.slice(0, -1).includes(record.service_type)
    setForm({
      service_type: isCustom ? 'Custom' : record.service_type,
      custom_type: isCustom ? record.service_type : '',
      date_performed: record.date_performed || '',
      mileage: record.mileage ?? '',
      cost: record.cost ?? '',
      vendor: record.vendor || '',
      notes: record.notes || ''
    })
    setError('')
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const service_type = form.service_type === 'Custom' ? form.custom_type : form.service_type
    if (!service_type) { setError('Service type is required'); setSaving(false); return }
    const payload = {
      user_vehicle_id: selectedVehicleId, service_type,
      date_performed: form.date_performed,
      mileage: form.mileage !== '' ? form.mileage : null,
      cost: form.cost !== '' ? form.cost : null,
      vendor: form.vendor || null,
      notes: form.notes || null
    }
    try {
      const url = editId ? `/api/maintenance/${editId}` : '/api/maintenance'
      const method = editId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Error') }
      else { fetchRecords(); setShowForm(false); setEditId(null) }
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await fetch(`/api/maintenance/${deleteTarget}`, { method: 'DELETE' })
    fetchRecords()
    setDeleteTarget(null)
  }

  // ── Attachments ──────────────────────────────────────────────────────────────

  const handleAttachClick = (recordId) => {
    setAttachTarget(recordId)
    setAttachError('')
    attachInputRef.current.value = ''
    attachInputRef.current.click()
  }

  const handleAttachFile = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length || !attachTarget) return
    setUploading(attachTarget)
    setAttachError('')
    const formData = new FormData()
    files.forEach(f => formData.append('attachments', f))
    try {
      const res = await fetch(`/api/maintenance/${attachTarget}/attachments`, { method: 'POST', body: formData })
      if (!res.ok) {
        const d = await res.json()
        setAttachError(d.error || 'Upload failed')
      } else {
        fetchRecords()
      }
    } catch {
      setAttachError('Upload failed — check your connection')
    } finally {
      setUploading(null)
      setAttachTarget(null)
    }
  }

  const handleRemoveAttachment = async (recordId, filename) => {
    setAttachError('')
    try {
      const res = await fetch(`/api/maintenance/${recordId}/attachments/${filename}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setAttachError(d.error || 'Remove failed') }
      else fetchRecords()
    } catch {
      setAttachError('Remove failed')
    }
  }

  const openLightbox = (attachments, index) => {
    const images = attachments.filter(a => !a.toLowerCase().endsWith('.pdf'))
    const imageIndex = attachments.slice(0, index + 1).filter(a => !a.toLowerCase().endsWith('.pdf')).length - 1
    if (images.length > 0 && imageIndex >= 0) setLightbox({ photos: images, index: imageIndex })
  }

  const totalCost = records.reduce((s, r) => s + (r.cost || 0), 0)

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Reminders & Service Intervals */}
      <ServiceIntervals vehicleId={selectedVehicleId} />

      {/* Hidden attachment file input */}
      <input
        ref={attachInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.tiff,.tif,.pdf"
        multiple
        className="hidden"
        onChange={handleAttachFile}
      />

      <div className="flex items-center justify-between">
        <h1 className="page-title">Maintenance Log</h1>
        <button onClick={openNew} className="btn-primary text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Entry
        </button>
      </div>

      {showForm && (
        <div className="card p-5">
          <div className="section-title mb-4">{editId ? 'Edit Entry' : 'New Entry'}</div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Service Type *</label>
              <select
                value={form.service_type}
                onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))}
                className="input-field"
                required
              >
                <option value="">Select…</option>
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {form.service_type === 'Custom' && (
              <div>
                <label className="label">Custom Service Name *</label>
                <input
                  type="text"
                  value={form.custom_type}
                  onChange={e => setForm(f => ({ ...f, custom_type: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
            )}
            <div>
              <label className="label">Date *</label>
              <input
                type="date"
                value={form.date_performed}
                onChange={e => setForm(f => ({ ...f, date_performed: e.target.value }))}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="label">Mileage</label>
              <input
                type="number"
                value={form.mileage}
                onChange={e => setForm(f => ({ ...f, mileage: e.target.value }))}
                className="input-field"
                placeholder="e.g. 12500"
              />
            </div>
            <div>
              <label className="label">Cost (USD)</label>
              <input
                type="number"
                value={form.cost}
                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                className="input-field"
                placeholder="0.00"
                step="0.01"
              />
            </div>
            <div>
              <label className="label">Vendor / Shop</label>
              <input
                type="text"
                value={form.vendor}
                onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="input-field"
                rows={2}
              />
            </div>
            {error && <div className="sm:col-span-2 text-red-600 dark:text-red-400 text-sm">{error}</div>}
            <div className="sm:col-span-2 flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary text-sm">
                {saving ? 'Saving…' : editId ? 'Save' : 'Add'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="btn-secondary text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {attachError && (
        <div className="text-sm text-red-600 dark:text-red-400">{attachError}</div>
      )}

      {loading ? (
        <div className="text-raptor-muted animate-pulse">Loading…</div>
      ) : records.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-raptor-secondary mb-4">No maintenance records yet.</p>
          <button onClick={openNew} className="btn-primary text-sm">Add First Entry</button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {records.map(r => {
              const attachments = r.attachments || []
              const imageAttachments = attachments.filter(a => !a.toLowerCase().endsWith('.pdf'))
              return (
                <div key={r.id} className="card p-4 space-y-3">
                  {/* Record header */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-semibold text-raptor-primary">{r.service_type}</span>
                        <span className="text-xs text-raptor-muted">
                          {new Date(r.date_performed + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {r.mileage != null && (
                          <span className="text-xs text-raptor-muted">{r.mileage.toLocaleString()} mi</span>
                        )}
                        {r.cost != null && (
                          <span className="text-sm text-raptor-accent font-semibold">
                            ${parseFloat(r.cost).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                      {r.vendor && <div className="text-xs text-raptor-muted mt-0.5">{r.vendor}</div>}
                      {r.notes && <div className="text-sm text-raptor-secondary mt-1 whitespace-pre-wrap">{r.notes}</div>}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleAttachClick(r.id)}
                        disabled={uploading === r.id}
                        className="text-raptor-muted hover:text-raptor-accent p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors"
                        title="Attach invoice or photo"
                      >
                        {uploading === r.id ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => openEdit(r)}
                        className="text-raptor-muted hover:text-raptor-primary p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(r.id)}
                        className="text-raptor-muted hover:text-red-500 p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Attachments */}
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-raptor-border">
                      {attachments.map((src, i) => {
                        const isPdf = src.toLowerCase().endsWith('.pdf')
                        const filename = src.split('/').pop()
                        return (
                          <div key={src} className="relative group">
                            {isPdf ? (
                              <a
                                href={src}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex flex-col items-center justify-center w-20 h-20 rounded-lg border border-raptor-border bg-raptor-elevated text-raptor-muted hover:text-raptor-accent hover:border-raptor-accent transition-colors gap-1 p-1"
                                title={filename}
                              >
                                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="text-xs font-medium">PDF</span>
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openLightbox(attachments, i)}
                                className="w-20 h-20 rounded-lg border border-raptor-border overflow-hidden hover:border-raptor-accent transition-colors"
                              >
                                <img src={src} alt="" className="w-full h-full object-cover" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(r.id, filename)}
                              className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs shadow"
                              aria-label="Remove attachment"
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {totalCost > 0 && (
            <div className="text-sm text-raptor-secondary px-1">
              Total maintenance spend:{' '}
              <span className="text-raptor-primary font-semibold">
                ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Entry"
          message="Delete this maintenance record and all its attachments? This cannot be undone."
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {lightbox && (
        <Lightbox
          photos={lightbox.photos}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
