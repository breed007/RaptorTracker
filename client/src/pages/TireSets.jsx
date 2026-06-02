import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ConfirmModal from '../components/ConfirmModal'

const EMPTY = {
  name: '', tire_brand: '', tire_model: '', tire_size: '', wheel_brand: '', wheel_size: '',
  quantity: '4', cost: '', purchase_date: '', install_date: '', removed_date: '',
  odometer_installed: '', odometer_removed: '', is_active: false, notes: '',
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function money(v) {
  if (v == null || v === '') return null
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function TireSets() {
  const { selectedVehicleId } = useApp()
  const [sets, setSets] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const fetchSets = useCallback(() => {
    if (!selectedVehicleId) return
    setLoading(true)
    fetch(`/api/tires?vehicle_id=${selectedVehicleId}`)
      .then(r => r.json())
      .then(d => setSets(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedVehicleId])

  useEffect(() => { fetchSets() }, [fetchSets])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => { setEditId(null); setForm(EMPTY); setError(''); setShowForm(true) }
  const openEdit = (s) => {
    setEditId(s.id)
    setForm({
      name: s.name || '', tire_brand: s.tire_brand || '', tire_model: s.tire_model || '',
      tire_size: s.tire_size || '', wheel_brand: s.wheel_brand || '', wheel_size: s.wheel_size || '',
      quantity: s.quantity ?? '4', cost: s.cost ?? '', purchase_date: s.purchase_date || '',
      install_date: s.install_date || '', removed_date: s.removed_date || '',
      odometer_installed: s.odometer_installed ?? '', odometer_removed: s.odometer_removed ?? '',
      is_active: !!s.is_active, notes: s.notes || '',
    })
    setError(''); setShowForm(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Set name is required'); return }
    setSaving(true)
    try {
      const url = editId ? `/api/tires/${editId}` : '/api/tires'
      const method = editId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, user_vehicle_id: selectedVehicleId }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Save failed') }
      else { fetchSets(); setShowForm(false); setEditId(null) }
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await fetch(`/api/tires/${deleteTarget}`, { method: 'DELETE' })
    setDeleteTarget(null); fetchSets()
  }

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
      <div className="flex items-center justify-between">
        <h1 className="page-title">Tire &amp; Wheel Sets</h1>
        <button onClick={openNew} className="btn-primary text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Set
        </button>
      </div>

      {showForm && (
        <div className="card p-5">
          <div className="section-title mb-4">{editId ? 'Edit Set' : 'New Tire / Wheel Set'}</div>
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Set Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} className="input-field" placeholder="e.g. Street 35s, Baja 37s" required />
            </div>
            <div><label className="label">Tire Brand</label><input value={form.tire_brand} onChange={e => set('tire_brand', e.target.value)} className="input-field" placeholder="e.g. BFGoodrich" /></div>
            <div><label className="label">Tire Model</label><input value={form.tire_model} onChange={e => set('tire_model', e.target.value)} className="input-field" placeholder="e.g. KO3" /></div>
            <div><label className="label">Tire Size</label><input value={form.tire_size} onChange={e => set('tire_size', e.target.value)} className="input-field" placeholder='e.g. 37x12.50R17' /></div>
            <div><label className="label">Quantity</label><input type="number" value={form.quantity} onChange={e => set('quantity', e.target.value)} className="input-field" placeholder="4" /></div>
            <div><label className="label">Wheel Brand</label><input value={form.wheel_brand} onChange={e => set('wheel_brand', e.target.value)} className="input-field" placeholder="e.g. Method" /></div>
            <div><label className="label">Wheel Size</label><input value={form.wheel_size} onChange={e => set('wheel_size', e.target.value)} className="input-field" placeholder='e.g. 17x8.5' /></div>
            <div><label className="label">Cost (set)</label><input type="number" step="0.01" value={form.cost} onChange={e => set('cost', e.target.value)} className="input-field" placeholder="0.00" /></div>
            <div><label className="label">Purchase Date</label><input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} className="input-field" /></div>
            <div><label className="label">Installed Date</label><input type="date" value={form.install_date} onChange={e => set('install_date', e.target.value)} className="input-field" /></div>
            <div><label className="label">Removed Date</label><input type="date" value={form.removed_date} onChange={e => set('removed_date', e.target.value)} className="input-field" /></div>
            <div><label className="label">Odometer at Install</label><input type="number" value={form.odometer_installed} onChange={e => set('odometer_installed', e.target.value)} className="input-field" placeholder="e.g. 8000" /></div>
            <div><label className="label">Odometer at Removal</label><input type="number" value={form.odometer_removed} onChange={e => set('odometer_removed', e.target.value)} className="input-field" placeholder="leave blank if still on" /></div>
            <div className="flex items-center gap-3 pt-6">
              <input id="is_active" type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 rounded accent-raptor-accent cursor-pointer" />
              <label htmlFor="is_active" className="label mb-0 cursor-pointer">Currently on the truck</label>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="input-field" rows={2} placeholder="Tread depth, rotation history, storage location…" />
            </div>
            {error && <div className="sm:col-span-2 text-sm text-red-500">{error}</div>}
            <div className="sm:col-span-2 flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Set'}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="btn-secondary text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-raptor-muted animate-pulse text-sm">Loading…</div>
      ) : sets.length === 0 ? (
        <div className="card p-10 text-center space-y-4">
          <p className="text-raptor-secondary">No tire or wheel sets yet.</p>
          <button onClick={openNew} className="btn-primary text-sm">Add Your First Set</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sets.map(s => (
            <div key={s.id} className={`card p-4 border-l-4 ${s.is_active ? 'border-l-green-500' : 'border-l-raptor-border'}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-raptor-primary">{s.name}</span>
                    {s.is_active
                      ? <span className="text-xs px-2 py-0.5 rounded bg-green-500/15 text-green-500 font-semibold">On truck</span>
                      : <span className="text-xs px-2 py-0.5 rounded bg-raptor-elevated border border-raptor-border text-raptor-muted">Stored</span>}
                  </div>
                  <div className="text-sm text-raptor-secondary">
                    {[s.tire_brand, s.tire_model, s.tire_size].filter(Boolean).join(' ') || '—'}
                  </div>
                  {(s.wheel_brand || s.wheel_size) && (
                    <div className="text-xs text-raptor-muted">Wheels: {[s.wheel_brand, s.wheel_size].filter(Boolean).join(' ')}</div>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-raptor-secondary pt-1">
                    {s.miles_on_set != null && <span><span className="text-raptor-muted">Miles on set:</span> {s.miles_on_set.toLocaleString()}</span>}
                    {money(s.cost) && <span><span className="text-raptor-muted">Cost:</span> {money(s.cost)}</span>}
                    {s.quantity && <span><span className="text-raptor-muted">Qty:</span> {s.quantity}</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-raptor-muted">
                    {s.install_date && <span>Installed {fmtDate(s.install_date)}</span>}
                    {s.removed_date && <span>Removed {fmtDate(s.removed_date)}</span>}
                  </div>
                  {s.notes && <div className="text-sm text-raptor-secondary whitespace-pre-wrap pt-1">{s.notes}</div>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(s)} className="text-raptor-muted hover:text-raptor-primary p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors" title="Edit">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => setDeleteTarget(s.id)} className="text-raptor-muted hover:text-red-500 p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors" title="Delete">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal title="Delete Set" message="Delete this tire/wheel set? This cannot be undone." danger
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  )
}
