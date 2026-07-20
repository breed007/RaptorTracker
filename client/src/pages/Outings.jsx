import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ConfirmModal from '../components/ConfirmModal'
import StatsCard from '../components/StatsCard'

const DIFFICULTY_CLS = {
  easy: 'bg-green-500/15 text-green-600 dark:text-green-400',
  moderate: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  difficult: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-500',
  extreme: 'bg-red-500/15 text-red-500',
}

const EMPTY = {
  name: '', date: new Date().toISOString().slice(0, 10), end_date: '',
  location: '', trail_name: '', difficulty: '', terrain: '',
  odometer_start: '', odometer_end: '', tire_psi_front: '', tire_psi_rear: '',
  tire_set_id: '', companions: '', conditions: '', damage: '', notes: '',
}

const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

export default function Outings() {
  const { selectedVehicleId, selectedVehicle } = useApp()
  const [data, setData] = useState(null)
  const [tireSets, setTireSets] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [photoTarget, setPhotoTarget] = useState(null)
  const photoRef = useRef(null)

  const load = useCallback(() => {
    if (!selectedVehicleId) return
    setLoading(true)
    Promise.all([
      fetch(`/api/outings?vehicle_id=${selectedVehicleId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/tires?vehicle_id=${selectedVehicleId}`).then(r => r.ok ? r.json() : []),
    ]).then(([d, t]) => {
      setData(d)
      setTireSets(Array.isArray(t) ? t : [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [selectedVehicleId])

  useEffect(() => { load() }, [load])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => { setEditId(null); setForm(EMPTY); setError(''); setShowForm(true) }
  const openEdit = (o) => {
    setEditId(o.id)
    setForm({
      name: o.name || '', date: o.date || '', end_date: o.end_date || '',
      location: o.location || '', trail_name: o.trail_name || '',
      difficulty: o.difficulty || '', terrain: o.terrain || '',
      odometer_start: o.odometer_start ?? '', odometer_end: o.odometer_end ?? '',
      tire_psi_front: o.tire_psi_front ?? '', tire_psi_rear: o.tire_psi_rear ?? '',
      tire_set_id: o.tire_set_id ?? '', companions: o.companions || '',
      conditions: o.conditions || '', damage: o.damage || '', notes: o.notes || '',
    })
    setError(''); setShowForm(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Give the outing a name.'); return }
    if (!form.date) { setError('Pick a date.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(editId ? `/api/outings/${editId}` : '/api/outings', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, user_vehicle_id: selectedVehicleId }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Could not save.') }
      else { setShowForm(false); setEditId(null); load() }
    } finally { setSaving(false) }
  }

  const remove = async () => {
    await fetch(`/api/outings/${deleteTarget}`, { method: 'DELETE' })
    setDeleteTarget(null); load()
  }

  const addPhotos = async (e) => {
    const files = e.target.files
    if (!files?.length || !photoTarget) return
    const fd = new FormData()
    for (const f of files) fd.append('photos', f)
    await fetch(`/api/outings/${photoTarget}/photos`, { method: 'POST', body: fd })
    e.target.value = ''; setPhotoTarget(null); load()
  }

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  const outings = data?.outings || []
  const s = data?.summary
  const difficulties = data?.options?.difficulties || []
  const terrain = data?.options?.terrain || []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Trail Log</h1>
          <p className="text-raptor-secondary text-sm mt-0.5">
            Where the truck's actually been — {selectedVehicle?.nickname}
          </p>
        </div>
        <button onClick={openNew} className="btn-primary text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Log an Outing
        </button>
      </div>

      {s && s.count > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatsCard label="Outings" value={s.count} accent />
          <StatsCard
            label="Trail Miles"
            value={s.totalMiles ? s.totalMiles.toLocaleString() : '—'}
            sub={s.milesKnownFor < s.count ? `${s.count - s.milesKnownFor} without odometer` : null}
          />
          <StatsCard label="Days Out" value={s.daysOut} />
          <StatsCard label="Trips With Damage" value={s.withDamage} sub={s.withDamage ? 'see notes' : 'none logged'} />
        </div>
      )}

      <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} />

      {showForm && (
        <div className="card p-5">
          <div className="section-title mb-4">{editId ? 'Edit Outing' : 'Log an Outing'}</div>
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} className="input-field" placeholder="e.g. Johnson Valley weekend" required />
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="label">End Date <span className="font-normal text-raptor-muted">(multi-day)</span></label>
              <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Location</label>
              <input value={form.location} onChange={e => set('location', e.target.value)} className="input-field" placeholder="e.g. Moab, UT" />
            </div>
            <div>
              <label className="label">Trail</label>
              <input value={form.trail_name} onChange={e => set('trail_name', e.target.value)} className="input-field" placeholder="e.g. Hell's Revenge" />
            </div>
            <div>
              <label className="label">Difficulty</label>
              <select value={form.difficulty} onChange={e => set('difficulty', e.target.value)} className="input-field">
                <option value="">—</option>
                {difficulties.map(d => <option key={d} value={d}>{cap(d)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Terrain</label>
              <select value={form.terrain} onChange={e => set('terrain', e.target.value)} className="input-field">
                <option value="">—</option>
                {terrain.map(t => <option key={t} value={t}>{cap(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Odometer Start</label>
              <input type="number" value={form.odometer_start} onChange={e => set('odometer_start', e.target.value)} className="input-field" placeholder="e.g. 24500" />
            </div>
            <div>
              <label className="label">Odometer End</label>
              <input type="number" value={form.odometer_end} onChange={e => set('odometer_end', e.target.value)} className="input-field" placeholder="e.g. 24680" />
            </div>
            <div>
              <label className="label">Aired-down PSI (front)</label>
              <input type="number" step="0.5" value={form.tire_psi_front} onChange={e => set('tire_psi_front', e.target.value)} className="input-field" placeholder="e.g. 18" />
            </div>
            <div>
              <label className="label">Aired-down PSI (rear)</label>
              <input type="number" step="0.5" value={form.tire_psi_rear} onChange={e => set('tire_psi_rear', e.target.value)} className="input-field" placeholder="e.g. 20" />
            </div>
            <div>
              <label className="label">Tire Set</label>
              <select value={form.tire_set_id} onChange={e => set('tire_set_id', e.target.value)} className="input-field">
                <option value="">—</option>
                {tireSets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Who Came</label>
              <input value={form.companions} onChange={e => set('companions', e.target.value)} className="input-field" placeholder="Optional" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Conditions</label>
              <input value={form.conditions} onChange={e => set('conditions', e.target.value)} className="input-field" placeholder="Weather, trail state…" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Damage / Issues</label>
              <textarea value={form.damage} onChange={e => set('damage', e.target.value)} className="input-field" rows={2} placeholder="Anything that broke, rubbed, or needs attention" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="input-field" rows={2} />
            </div>
            {error && <div className="sm:col-span-2 text-sm text-red-500">{error}</div>}
            <div className="sm:col-span-2 flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : editId ? 'Save Changes' : 'Log Outing'}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="btn-secondary text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading && !data ? (
        <div className="text-raptor-muted animate-pulse text-sm">Loading…</div>
      ) : outings.length === 0 ? (
        <div className="card p-10 text-center space-y-4">
          <p className="text-raptor-secondary">No outings logged yet.</p>
          <p className="text-sm text-raptor-muted">
            Everything else here tracks what's been done <em>to</em> the truck. This is where you record actually using it.
          </p>
          <button onClick={openNew} className="btn-primary text-sm">Log Your First Outing</button>
        </div>
      ) : (
        <div className="space-y-3">
          {outings.map(o => (
            <div key={o.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-raptor-primary">{o.name}</span>
                    {o.difficulty && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${DIFFICULTY_CLS[o.difficulty] || ''}`}>
                        {cap(o.difficulty)}
                      </span>
                    )}
                    {o.terrain && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-raptor-elevated border border-raptor-border text-raptor-muted">
                        {cap(o.terrain)}
                      </span>
                    )}
                    {o.damage && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-500/15 text-red-500">damage</span>
                    )}
                  </div>

                  <div className="text-sm text-raptor-secondary">
                    {[o.trail_name, o.location].filter(Boolean).join(' · ') || '—'}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-raptor-muted">
                    <span>{fmtDate(o.date)}{o.end_date ? ` → ${fmtDate(o.end_date)}` : ''}</span>
                    {o.miles != null && <span>{o.miles.toLocaleString()} mi</span>}
                    {(o.tire_psi_front != null || o.tire_psi_rear != null) && (
                      <span>Aired to {o.tire_psi_front ?? '—'}/{o.tire_psi_rear ?? '—'} psi</span>
                    )}
                    {o.tire_set_name && <span>on {o.tire_set_name}</span>}
                    {o.companions && <span>with {o.companions}</span>}
                  </div>

                  {o.conditions && <div className="text-sm text-raptor-secondary">{o.conditions}</div>}
                  {o.damage && (
                    <div className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
                      {o.damage}
                      <Link to="/maintenance" className="ml-2 text-xs text-raptor-accent hover:underline">Log a repair →</Link>
                    </div>
                  )}
                  {o.notes && <div className="text-sm text-raptor-secondary whitespace-pre-wrap">{o.notes}</div>}

                  {o.photos?.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {o.photos.map(p => (
                        <a key={p} href={p} target="_blank" rel="noopener noreferrer"
                          className="w-16 h-16 rounded-lg border border-raptor-border overflow-hidden hover:border-raptor-accent transition-colors">
                          <img src={p} alt="" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => { setPhotoTarget(o.id); setTimeout(() => photoRef.current?.click(), 0) }}
                    className="text-raptor-muted hover:text-raptor-accent p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors" title="Add photos">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button onClick={() => openEdit(o)} className="text-raptor-muted hover:text-raptor-primary p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors" title="Edit">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => setDeleteTarget(o.id)} className="text-raptor-muted hover:text-red-500 p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors" title="Delete">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal title="Delete Outing" message="Delete this outing and its photos? This cannot be undone."
          danger onConfirm={remove} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  )
}
