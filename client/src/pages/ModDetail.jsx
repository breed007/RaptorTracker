import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import PhotoGrid from '../components/PhotoGrid'
import ConfirmModal from '../components/ConfirmModal'

const CATEGORIES = ['Armor','Audio','Bed_Accessories','Bumpers','Electrical','Engine','Interior','Lighting','Performance','Recovery','Suspension','Tires_Wheels','Other']
const STATUSES = ['Researching','Ordered','In_Transit','Installed','Removed']

const EMPTY_FORM = {
  part_name: '', part_number: '', brand: '', vendor: '', vendor_url: '',
  category: 'Other', status: 'Researching', purchase_date: '', install_date: '',
  cost: '', mileage_at_install: '', aux_switches: [], amp_draw: '',
  install_notes: '', wiring_notes: '', photos: []
}

export default function ModDetail({ isNew }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { selectedVehicleId, selectedVehicle } = useApp()

  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (isNew) {
      const preAux = searchParams.get('aux')
      const preAuxLabel = searchParams.get('aux_label')
      // Keep switch_number as a string — must match the string option values in the <select>
      const preAssignment = preAux
        ? [{ switch_number: String(preAux), label: preAuxLabel || '' }]
        : []
      setForm({ ...EMPTY_FORM, aux_switches: preAssignment, user_vehicle_id: selectedVehicleId })
      return
    }
    fetch(`/api/mods/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        // Normalize aux_switches: prefer the array, fall back to legacy single-switch field.
        // Always store switch_number as a STRING so React's controlled <select> matching works
        // (option values are strings; a numeric value wouldn't match and the select shows "—").
        const rawSwitches = Array.isArray(data.aux_switches) ? data.aux_switches : []
        const auxSwitches = rawSwitches.length > 0
          ? rawSwitches.map(s => ({ ...s, switch_number: String(s.switch_number) }))
          : (data.aux_switch ? [{ switch_number: String(data.aux_switch), label: data.aux_label || '' }] : [])
        setForm({
          ...EMPTY_FORM,           // start clean so no unexpected fields leak in
          ...data,                 // overlay API fields
          cost: data.cost ?? '',
          mileage_at_install: data.mileage_at_install ?? '',
          amp_draw: data.amp_draw ?? '',
          aux_switches: auxSwitches,
          photos: Array.isArray(data.photos) ? data.photos : [],
        })
        setLoading(false)
      })
      .catch(() => { navigate('/mods') })
  }, [id, isNew, selectedVehicleId])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    // Filter out incomplete entries (switch number not yet selected)
    const validSwitches = (Array.isArray(form.aux_switches) ? form.aux_switches : [])
      .filter(s => s.switch_number !== '' && s.switch_number != null && !isNaN(parseInt(s.switch_number)))
      .map(s => ({ switch_number: parseInt(s.switch_number), label: s.label || '' }))

    const payload = {
      ...form,
      user_vehicle_id: isNew ? selectedVehicleId : form.user_vehicle_id,
      cost: form.cost !== '' ? parseFloat(form.cost) : null,
      mileage_at_install: form.mileage_at_install !== '' ? parseInt(form.mileage_at_install) : null,
      aux_switches: validSwitches,
      amp_draw: form.amp_draw !== '' ? parseFloat(form.amp_draw) : null,
    }
    try {
      const url = isNew ? '/api/mods' : `/api/mods/${id}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const d = await res.json(); setError(d.error || 'Save failed')
      } else {
        const saved = isNew ? await res.json() : { id }
        navigate(`/mods/${saved.id || id}`)
      }
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await fetch(`/api/mods/${id}`, { method: 'DELETE' })
    navigate('/mods')
  }

  const handlePhotoUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    if (form.photos.length + files.length > 10) {
      setError('Maximum 10 photos per mod'); return
    }
    setUploading(true)
    const fd = new FormData()
    for (const f of files) fd.append('photos', f)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.files) {
        set('photos', [...form.photos, ...data.files.map(f => f.path)])
      } else {
        setError(data.error || 'Upload failed')
      }
    } catch {
      setError('Upload failed')
    } finally { setUploading(false); e.target.value = '' }
  }

  const removePhoto = (index) => {
    set('photos', form.photos.filter((_, i) => i !== index))
  }

  const auxCount = selectedVehicle?.aux_switch_count || form.aux_switch_count || 0

  if (loading) return <div className="text-raptor-muted animate-pulse">Loading…</div>

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/mods" className="text-raptor-secondary hover:text-raptor-primary">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="page-title">{isNew ? 'New Mod' : 'Edit Mod'}</h1>
        {!isNew && <StatusBadge status={form.status} />}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="card p-5 space-y-4">
          <div className="section-title">Part Details</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Part Name *</label>
              <input type="text" value={form.part_name} onChange={e => set('part_name', e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="label">Brand</label>
              <input type="text" value={form.brand} onChange={e => set('brand', e.target.value)} className="input-field" placeholder="e.g. Baja Designs" />
            </div>
            <div>
              <label className="label">Part Number</label>
              <input type="text" value={form.part_number} onChange={e => set('part_number', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Vendor</label>
              <input type="text" value={form.vendor} onChange={e => set('vendor', e.target.value)} className="input-field" placeholder="e.g. Carid, Amazon" />
            </div>
            <div>
              <label className="label">Vendor URL</label>
              <input type="url" value={form.vendor_url} onChange={e => set('vendor_url', e.target.value)} className="input-field" placeholder="https://…" />
            </div>
            <div>
              <label className="label">Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} className="input-field">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className="input-field">
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div className="section-title">Purchase & Install</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Cost (USD)</label>
              <input type="number" value={form.cost} onChange={e => set('cost', e.target.value)} className="input-field" placeholder="0.00" step="0.01" min="0" />
            </div>
            <div>
              <label className="label">Purchase Date</label>
              <input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Install Date</label>
              <input type="date" value={form.install_date} onChange={e => set('install_date', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Mileage at Install</label>
              <input type="number" value={form.mileage_at_install} onChange={e => set('mileage_at_install', e.target.value)} className="input-field" placeholder="e.g. 8420" min="0" step="1" />
            </div>
          </div>
        </div>

        {auxCount > 0 && (
          <div className="card p-5 space-y-4">
            <div className="section-title">AUX Switch Assignments</div>

            <div className="sm:w-1/2">
              <label className="label">
                Amp Draw <span className="font-normal text-raptor-muted">(A — powers the capacity planner)</span>
              </label>
              <input
                type="number" min="0" step="0.1"
                value={form.amp_draw}
                onChange={e => set('amp_draw', e.target.value)}
                className="input-field"
                placeholder="e.g. 6.5"
              />
            </div>

            {/* Existing switch rows */}
            {Array.isArray(form.aux_switches) && form.aux_switches.length > 0 && (
              <div className="space-y-3">
                {form.aux_switches.map((sw, idx) => {
                  const usedByOthers = form.aux_switches
                    .filter((_, i) => i !== idx)
                    .map(s => parseInt(s.switch_number))
                    .filter(n => !isNaN(n))
                  return (
                    <div key={idx} className="flex items-end gap-3">
                      <div className="flex-shrink-0">
                        <label className="label">Switch</label>
                        <select
                          value={sw.switch_number != null ? String(sw.switch_number) : ''}
                          onChange={e => {
                            const updated = form.aux_switches.map((s, i) =>
                              i === idx ? { ...s, switch_number: e.target.value } : s
                            )
                            set('aux_switches', updated)
                          }}
                          className="input-field w-28"
                        >
                          <option value="">—</option>
                          {Array.from({ length: auxCount }, (_, i) => i + 1).map(n => (
                            <option key={n} value={String(n)} disabled={usedByOthers.includes(n)}>
                              AUX {n}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="label">
                          Label <span className="font-normal text-raptor-muted">(what this switch controls)</span>
                        </label>
                        <input
                          type="text"
                          value={sw.label ?? ''}
                          onChange={e => {
                            const updated = form.aux_switches.map((s, i) =>
                              i === idx ? { ...s, label: e.target.value } : s
                            )
                            set('aux_switches', updated)
                          }}
                          className="input-field"
                          placeholder={idx === 0 ? 'e.g. Power' : 'e.g. Color Change'}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => set('aux_switches', form.aux_switches.filter((_, i) => i !== idx))}
                        className="flex-shrink-0 mb-0.5 text-raptor-muted hover:text-red-500 p-2 rounded-lg hover:bg-raptor-elevated transition-colors"
                        title="Remove this switch"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add / assign button — shown when under the max */}
            {(!Array.isArray(form.aux_switches) || form.aux_switches.length < auxCount) && (
              <button
                type="button"
                onClick={() => set('aux_switches', [...(Array.isArray(form.aux_switches) ? form.aux_switches : []), { switch_number: '', label: '' }])}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {Array.isArray(form.aux_switches) && form.aux_switches.length > 0 ? 'Add Another Switch' : 'Assign an AUX Switch'}
              </button>
            )}
          </div>
        )}

        <div className="card p-5 space-y-4">
          <div className="section-title">Notes</div>
          <div>
            <label className="label">Install Notes</label>
            <textarea value={form.install_notes} onChange={e => set('install_notes', e.target.value)} className="input-field" rows={3} placeholder="Steps, torque specs, tips…" />
          </div>
          <div>
            <label className="label">Wiring Notes</label>
            <textarea value={form.wiring_notes} onChange={e => set('wiring_notes', e.target.value)} className="input-field" rows={3} placeholder="Wire colors, connector types, fuse locations…" />
          </div>
        </div>

        <div className="card p-5">
          <div className="section-title mb-3">Photos ({form.photos.length}/10)</div>
          <PhotoGrid photos={form.photos} onRemove={removePhoto} />
          {form.photos.length < 10 && (
            <div className="mt-3">
              <label className="btn-secondary text-sm cursor-pointer inline-flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {uploading ? 'Uploading…' : 'Add Photos'}
                <input type="file" accept="image/*" multiple className="sr-only" onChange={handlePhotoUpload} disabled={uploading} />
              </label>
              <span className="text-xs text-raptor-muted ml-3">JPG, PNG, WebP — max 20MB each</span>
            </div>
          )}
        </div>

        {error && (
          <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving…' : isNew ? 'Add Mod' : 'Save Changes'}
          </button>
          <Link to="/mods" className="btn-secondary">Cancel</Link>
          {!isNew && (
            <button type="button" onClick={() => setShowDelete(true)} className="btn-danger ml-auto">Delete Mod</button>
          )}
        </div>
      </form>

      {showDelete && (
        <ConfirmModal
          title="Delete Mod"
          message={`Delete "${form.part_name}"? This cannot be undone.`}
          danger
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  )
}
