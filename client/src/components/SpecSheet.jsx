import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const CATEGORY_LABELS = {
  fluids: 'Fluids',
  capacities: 'Capacities',
  torque: 'Torque Specs',
  electrical: 'Electrical',
  tires: 'Tires & Wheels',
  dimensions: 'Dimensions',
  other: 'Other',
}
const CATEGORIES = Object.keys(CATEGORY_LABELS)

const EMPTY = { category: 'fluids', name: '', value: '', unit: '', source: '', notes: '' }

/**
 * Owner-maintained spec sheet.
 *
 * Deliberately user-supplied: Ford's workshop/service data (torque values, wire
 * colors) is licensed content, so RaptorTracker links to the official sources
 * rather than reproducing them. What you record here is yours, and it can be
 * exported/imported as CSV so specs can be shared between owners.
 */
export default function SpecSheet() {
  const { selectedVehicleId, selectedVehicle } = useApp()
  const [specs, setSpecs] = useState([])
  const [resources, setResources] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!selectedVehicleId) return
    fetch(`/api/specs?vehicle_id=${selectedVehicleId}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setSpecs(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [selectedVehicleId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/specs/resources').then(r => r.ok ? r.json() : null)
      .then(d => setResources(d?.resources || [])).catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => { setEditId(null); setForm(EMPTY); setError(''); setShowForm(true) }
  const openEdit = (s) => {
    setEditId(s.id)
    setForm({ category: s.category || 'other', name: s.name || '', value: s.value || '', unit: s.unit || '', source: s.source || '', notes: s.notes || '' })
    setError(''); setShowForm(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Give the spec a name.'); return }
    setSaving(true); setError('')
    try {
      const url = editId ? `/api/specs/${editId}` : '/api/specs'
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, user_vehicle_id: selectedVehicleId }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Could not save.') }
      else { setShowForm(false); setEditId(null); setForm(EMPTY); load() }
    } finally { setSaving(false) }
  }

  const remove = async (id) => {
    await fetch(`/api/specs/${id}`, { method: 'DELETE' })
    load()
  }

  const grouped = {}
  for (const s of specs) (grouped[s.category || 'other'] = grouped[s.category || 'other'] || []).push(s)
  const usedCategories = CATEGORIES.filter(c => grouped[c]?.length)

  return (
    <div className="space-y-5">
      {/* Official sources */}
      <div className="card p-5">
        <div className="section-title mb-2">Official Sources</div>
        <p className="text-sm text-raptor-secondary mb-3">
          RaptorTracker links to Ford's own documentation rather than reproducing it — service manual
          content is licensed, and copying it into an app you can share isn't ours to do. Grab the figures
          you need from the source, then record them below so they're a tap away next time.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {resources.map(r => (
            <a
              key={r.id}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-raptor-border bg-raptor-elevated p-3 hover:border-raptor-accent transition-colors"
            >
              <div className="text-sm font-medium text-raptor-accent">{r.label} ↗</div>
              <div className="text-xs text-raptor-muted mt-0.5">{r.note}</div>
            </a>
          ))}
        </div>
      </div>

      {/* Owner spec sheet */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="section-title">My Spec Sheet</div>
            {selectedVehicle && <div className="text-xs text-raptor-muted mt-0.5">{selectedVehicle.nickname}</div>}
          </div>
          {selectedVehicleId && (
            <button onClick={openNew} className="btn-primary text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Spec
            </button>
          )}
        </div>

        {!selectedVehicleId ? (
          <p className="text-sm text-raptor-secondary">
            Add a vehicle in <Link to="/garage" className="text-raptor-accent hover:underline">My Garage</Link> to start a spec sheet.
          </p>
        ) : (
          <>
            {showForm && (
              <form onSubmit={submit} className="rounded-lg border border-raptor-border bg-raptor-elevated p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Category</label>
                  <select value={form.category} onChange={e => set('category', e.target.value)} className="input-field">
                    {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Spec *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)} className="input-field" placeholder="e.g. Engine oil capacity" required />
                </div>
                <div>
                  <label className="label">Value</label>
                  <input value={form.value} onChange={e => set('value', e.target.value)} className="input-field" placeholder="e.g. 7.0" />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <input value={form.unit} onChange={e => set('unit', e.target.value)} className="input-field" placeholder="e.g. qt, lb-ft, psi" />
                </div>
                <div>
                  <label className="label">Source</label>
                  <input value={form.source} onChange={e => set('source', e.target.value)} className="input-field" placeholder="e.g. Owner's manual p.312" />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <input value={form.notes} onChange={e => set('notes', e.target.value)} className="input-field" placeholder="Optional" />
                </div>
                {error && <div className="sm:col-span-2 text-sm text-red-500">{error}</div>}
                <div className="sm:col-span-2 flex gap-2">
                  <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : editId ? 'Save' : 'Add Spec'}</button>
                  <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="btn-secondary text-sm">Cancel</button>
                </div>
              </form>
            )}

            {specs.length === 0 ? (
              <p className="text-sm text-raptor-secondary">
                No specs recorded yet. Add the numbers you actually look up — oil capacity, lug nut torque,
                tire pressures — or bulk-import a sheet from{' '}
                <Link to="/export" className="text-raptor-accent hover:underline">Export &amp; Backup</Link>.
              </p>
            ) : (
              <div className="space-y-4">
                {usedCategories.map(cat => (
                  <div key={cat}>
                    <div className="text-xs font-semibold text-raptor-muted uppercase tracking-wide mb-1">{CATEGORY_LABELS[cat]}</div>
                    <div className="divide-y divide-raptor-border border-t border-raptor-border">
                      {grouped[cat].map(s => (
                        <div key={s.id} className="py-2 flex items-center gap-3 text-sm">
                          <span className="flex-1 min-w-0">
                            <span className="block text-raptor-primary truncate">{s.name}</span>
                            {(s.source || s.notes) && (
                              <span className="block text-xs text-raptor-muted truncate">
                                {[s.source, s.notes].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </span>
                          <span className="text-raptor-primary font-medium tabular-nums flex-shrink-0">
                            {s.value}{s.unit ? ` ${s.unit}` : ''}
                          </span>
                          <button onClick={() => openEdit(s)} className="text-raptor-muted hover:text-raptor-primary flex-shrink-0" title="Edit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => remove(s.id)} className="text-raptor-muted hover:text-red-500 flex-shrink-0" title="Delete">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-raptor-muted">
              Your spec sheet exports and imports as CSV, so you can share one with other owners of the same
              generation — or start from theirs.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
