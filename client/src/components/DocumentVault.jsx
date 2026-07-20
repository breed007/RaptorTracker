import React, { useCallback, useEffect, useRef, useState } from 'react'

const DOC_TYPES = [
  { id: 'title', label: 'Title' },
  { id: 'registration', label: 'Registration' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'bill_of_sale', label: 'Bill of Sale' },
  { id: 'inspection', label: 'Inspection' },
  { id: 'manual', label: 'Manual' },
  { id: 'other', label: 'Other' },
]
const typeLabel = (id) => DOC_TYPES.find(t => t.id === id)?.label || 'Other'

const isPdf = (p) => String(p).toLowerCase().endsWith('.pdf')
const fmtSize = (b) => b == null ? '' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

function expiryState(d) {
  if (!d) return null
  const days = Math.floor((new Date(d + 'T12:00:00') - new Date()) / 86400000)
  if (days < 0) return { cls: 'text-red-500 dark:text-red-400', tag: 'expired' }
  if (days <= 30) return { cls: 'text-yellow-600 dark:text-yellow-500', tag: `${days}d` }
  return { cls: 'text-raptor-secondary', tag: null }
}

/**
 * Per-vehicle document vault. Title, registration card, insurance card, bill of
 * sale — the paperwork that should live with the truck rather than in a drawer.
 */
export default function DocumentVault({ vehicle, onClose }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', doc_type: 'other', expires_on: '', notes: '' })
  const fileRef = useRef(null)
  const camRef = useRef(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/documents?vehicle_id=${vehicle.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setDocs(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [vehicle.id])

  useEffect(() => { load() }, [load])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('user_vehicle_id', vehicle.id)
      fd.append('name', form.name || file.name)
      fd.append('doc_type', form.doc_type)
      if (form.expires_on) fd.append('expires_on', form.expires_on)
      if (form.notes) fd.append('notes', form.notes)
      const res = await fetch('/api/documents', { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Upload failed') }
      else { setForm({ name: '', doc_type: 'other', expires_on: '', notes: '' }); load() }
    } catch {
      setError('Upload failed — check your connection.')
    } finally {
      setUploading(false)
      // Reset BOTH inputs, or capturing the same file twice won't re-fire onChange
      if (fileRef.current) fileRef.current.value = ''
      if (camRef.current) camRef.current.value = ''
    }
  }

  const remove = async (id) => {
    await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-raptor-card border border-raptor-border rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-raptor-border flex-shrink-0">
          <div>
            <div className="font-display font-bold text-raptor-primary">{vehicle.nickname}</div>
            <div className="text-xs text-raptor-muted mt-0.5">Documents · {docs.length} on file</div>
          </div>
          <button onClick={onClose} className="text-raptor-muted hover:text-raptor-primary transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Add */}
          <div className="rounded-lg border border-raptor-border bg-raptor-elevated p-4 space-y-3">
            <div className="text-xs font-semibold text-raptor-muted uppercase tracking-wide">Add a document</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Name</label>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                  className="input-field" placeholder="Defaults to the file name" />
              </div>
              <div>
                <label className="label">Type</label>
                <select value={form.doc_type} onChange={e => set('doc_type', e.target.value)} className="input-field">
                  {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Expires <span className="font-normal text-raptor-muted">(optional)</span></label>
                <input type="date" value={form.expires_on} onChange={e => set('expires_on', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="label">Notes</label>
                <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} className="input-field" placeholder="Optional" />
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.tiff,.tif,.pdf,.heic" className="hidden" onChange={handleFile} />
            {/* capture="environment" opens the rear camera straight away on a phone */}
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => camRef.current?.click()} disabled={uploading}
                className="btn-primary text-sm disabled:opacity-50 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {uploading ? 'Uploading…' : 'Take Photo'}
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="btn-secondary text-sm disabled:opacity-50">
                Choose File
              </button>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          {/* List */}
          {loading ? (
            <div className="text-raptor-muted animate-pulse text-sm">Loading…</div>
          ) : docs.length === 0 ? (
            <div className="text-center py-8 text-raptor-secondary text-sm">
              No documents yet. Title, registration, insurance card, bill of sale — keep them with the truck.
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map(d => {
                const exp = expiryState(d.expires_on)
                return (
                  <div key={d.id} className="flex items-center gap-3 rounded-lg border border-raptor-border p-3">
                    <div className="w-10 h-10 rounded flex items-center justify-center bg-raptor-elevated flex-shrink-0 overflow-hidden">
                      {isPdf(d.file_path) ? (
                        <svg className="w-5 h-5 text-raptor-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      ) : (
                        <img src={d.file_path} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-raptor-primary truncate">{d.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-raptor-elevated border border-raptor-border text-raptor-muted">
                          {typeLabel(d.doc_type)}
                        </span>
                      </div>
                      <div className="text-xs text-raptor-muted mt-0.5 flex flex-wrap gap-x-3">
                        {d.size_bytes != null && <span>{fmtSize(d.size_bytes)}</span>}
                        {d.expires_on && (
                          <span className={exp?.cls}>
                            Expires {fmtDate(d.expires_on)}{exp?.tag ? ` (${exp.tag})` : ''}
                          </span>
                        )}
                        {d.notes && <span className="truncate">{d.notes}</span>}
                      </div>
                    </div>
                    <a href={d.file_path} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-raptor-accent hover:underline flex-shrink-0">Open</a>
                    <button onClick={() => remove(d.id)}
                      className="text-raptor-muted hover:text-red-500 flex-shrink-0" title="Delete">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
