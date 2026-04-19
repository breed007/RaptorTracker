import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import PhotoGrid from '../components/PhotoGrid'
import ConfirmModal from '../components/ConfirmModal'

const CATEGORIES = ['Suspension','Tires_Wheels','Lighting','Bumpers','Armor','Engine','Performance','Interior','Audio','Electrical','Recovery','Bed_Accessories','Other']
const STATUSES = ['Researching','Ordered','In_Transit','Installed','Removed']

const EMPTY_FORM = {
  part_name: '', part_number: '', brand: '', vendor: '', vendor_url: '',
  category: 'Other', status: 'Researching', purchase_date: '', install_date: '',
  cost: '', mileage_at_install: '', aux_switch: '', aux_label: '',
  install_notes: '', wiring_notes: '', photos: []
}

export default function ModDetail({ isNew }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { selectedVehicleId, selectedVehicle } = useApp()

  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (isNew) {
      const preAux = searchParams.get('aux')
      const preAuxLabel = searchParams.get('aux_label')
      setForm({ ...EMPTY_FORM, aux_switch: preAux || '', aux_label: preAuxLabel || '', user_vehicle_id: selectedVehicleId })
      return
    }
    fetch(`/api/mods/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setForm({ ...data, cost: data.cost ?? '', mileage_at_install: data.mileage_at_install ?? '', aux_switch: data.aux_switch ?? '', photos: data.photos || [] }); setLoading(false) })
      .catch(() => { navigate('/mods') })
  }, [id, isNew, selectedVehicleId])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const payload = {
      ...form,
      user_vehicle_id: isNew ? selectedVehicleId : form.user_vehicle_id,
      cost: form.cost !== '' ? parseFloat(form.cost) : null,
      mileage_at_install: form.mileage_at_install !== '' ? parseInt(form.mileage_at_install) : null,
      aux_switch: form.aux_switch !== '' ? parseInt(form.aux_switch) : null,
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
            <div className="section-title">AUX Switch Assignment</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">AUX Switch #</label>
                <select value={form.aux_switch} onChange={e => set('aux_switch', e.target.value)} className="input-field">
                  <option value="">Not assigned</option>
                  {Array.from({ length: auxCount }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>AUX {n}</option>
                  ))}
                </select>
              </div>
              {form.aux_switch && (
                <div>
                  <label className="label">AUX Label</label>
                  <input type="text" value={form.aux_label} onChange={e => set('aux_label', e.target.value)} className="input-field" placeholder="e.g. Baja Designs LP6" />
                </div>
              )}
            </div>
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
