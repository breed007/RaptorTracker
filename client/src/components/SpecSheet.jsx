import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const CATEGORY_LABELS = {
  fluids: 'Fluids',
  capacities: 'Capacities',
  torque: 'Torque Specs',
  parts: 'Service Parts',
  electrical: 'Electrical',
  tires: 'Tires & Wheels',
  dimensions: 'Dimensions',
  other: 'Other',
}
const CATEGORIES = Object.keys(CATEGORY_LABELS)

const EMPTY = { category: 'fluids', name: '', value: '', unit: '', source: '', notes: '' }

/**
 * Owner-maintained spec sheet, plus Ford's own figures for the generation.
 *
 * Ford's workshop/service data (wire colors, most torque values) is licensed
 * content and isn't reproduced. The factory panel is a short list of
 * capacities and part numbers from the free owner's manual, with the manual
 * cited; owners copy lines into their own sheet, where they can edit them.
 */
function FactoryFigures({ vehicleId, specs, onAdded }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    fetch(`/api/specs/factory?vehicle_id=${vehicleId}`).then(r => (r.ok ? r.json() : null)).then(setData).catch(() => {})
  }, [vehicleId])
  const ref = data?.reference
  if (!ref) return null

  const have = new Set(specs.map(s => `${s.category}|${s.name}`.toLowerCase()))
  const keyOf = (it, group) => `${it.category}|${group.title ? `${it.name} (${group.title})` : it.name}`.toLowerCase()
  const add = async (items) => {
    setBusy(true)
    try {
      for (const { it, group } of items) {
        await fetch('/api/specs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_vehicle_id: vehicleId, category: it.category,
            name: group.title ? `${it.name} (${group.title})` : it.name,
            value: it.value, unit: '', source: ref.source.title, notes: it.spec || '',
          }),
        })
      }
      onAdded()
    } finally { setBusy(false) }
  }
  const missing = ref.groups.flatMap(group => group.items.filter(it => !have.has(keyOf(it, group))).map(it => ({ it, group })))

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="section-title">Ford&apos;s Figures — {data.model} {data.generation}</div>
          <div className="text-xs text-raptor-muted mt-0.5">
            From the{' '}
            <a href={ref.source.url} target="_blank" rel="noopener noreferrer" className="text-raptor-link underline underline-offset-2 hover:no-underline">{ref.source.title} ↗</a>
            , as Ford printed it. {ref.note}
          </div>
        </div>
        {missing.length > 0 && (
          <button type="button" disabled={busy} onClick={() => add(missing)} className="btn-secondary text-sm disabled:opacity-50">
            {busy ? 'Adding…' : `Add ${missing.length === ref.groups.reduce((n, g) => n + g.items.length, 0) ? 'all' : `the other ${missing.length}`} to my sheet`}
          </button>
        )}
      </div>
      {ref.groups.map(group => (
        <div key={group.title || 'main'} className="space-y-1">
          {group.title && <div className="text-xs font-semibold uppercase tracking-wide text-raptor-muted pt-1">{group.title}</div>}
          <div className="divide-y divide-raptor-border">
            {group.items.map(it => {
              const added = have.has(keyOf(it, group))
              return (
                <div key={it.name} className="py-2 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm"><span className="font-medium text-raptor-primary">{it.name}</span>{' '}
                      <span className="text-raptor-secondary">{it.value}</span></div>
                    {it.spec && <div className="text-xs text-raptor-muted">{it.spec}</div>}
                  </div>
                  {added
                    ? <span className="text-xs text-raptor-muted flex-shrink-0 pt-0.5">In my sheet</span>
                    : <button type="button" disabled={busy} onClick={() => add([{ it, group }])} className="text-xs text-raptor-link underline underline-offset-2 hover:no-underline flex-shrink-0 pt-0.5 disabled:opacity-50">Add</button>}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-raptor-muted">Check your own manual when a figure depends on equipment, and your door-jamb label for tire pressures.</p>
    </div>
  )
}
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
      {selectedVehicleId && <FactoryFigures vehicleId={selectedVehicleId} specs={specs} onAdded={load} />}

      {/* Official sources */}
      <div className="card p-5">
        <div className="section-title mb-2">Official Sources</div>
        <p className="text-sm text-raptor-secondary mb-3">
          Ford&apos;s service manual content is licensed, so RaptorTracker links to it rather than copying it.
          The owner&apos;s-manual figures above cover the common jobs; for anything else, look it up at the
          source and record it below so it&apos;s a tap away next time.
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
              <div className="text-sm font-medium text-raptor-link">{r.label} ↗</div>
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
              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Spec
            </button>
          )}
        </div>

        {!selectedVehicleId ? (
          <p className="text-sm text-raptor-secondary">
            Add a vehicle in <Link to="/garage" className="text-raptor-link underline underline-offset-2 hover:no-underline">My Garage</Link> to start a spec sheet.
          </p>
        ) : (
          <>
            {showForm && (
              <form onSubmit={submit} className="rounded-lg border border-raptor-border bg-raptor-elevated p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="spec-sheet-category" className="label">Category</label>
                  <select id="spec-sheet-category" value={form.category} onChange={e => set('category', e.target.value)} className="input-field">
                    {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="spec-sheet-name" className="label">Spec *</label>
                  <input id="spec-sheet-name" value={form.name} onChange={e => set('name', e.target.value)} className="input-field" placeholder="e.g. Engine oil capacity" required />
                </div>
                <div>
                  <label htmlFor="spec-sheet-value" className="label">Value</label>
                  <input id="spec-sheet-value" value={form.value} onChange={e => set('value', e.target.value)} className="input-field" placeholder="e.g. 7.0" />
                </div>
                <div>
                  <label htmlFor="spec-sheet-unit" className="label">Unit</label>
                  <input id="spec-sheet-unit" value={form.unit} onChange={e => set('unit', e.target.value)} className="input-field" placeholder="e.g. qt, lb-ft, psi" />
                </div>
                <div>
                  <label htmlFor="spec-sheet-source" className="label">Source</label>
                  <input id="spec-sheet-source" value={form.source} onChange={e => set('source', e.target.value)} className="input-field" placeholder="e.g. Owner's manual p.312" />
                </div>
                <div>
                  <label htmlFor="spec-sheet-notes" className="label">Notes</label>
                  <input id="spec-sheet-notes" value={form.notes} onChange={e => set('notes', e.target.value)} className="input-field" placeholder="Optional" />
                </div>
                {error && <div className="sm:col-span-2 text-sm text-red-700 dark:text-red-400">{error}</div>}
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
                <Link to="/settings/data" className="text-raptor-link underline underline-offset-2 hover:no-underline">Settings → Import &amp; Export</Link>.
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
                          <button aria-label="Edit" onClick={() => openEdit(s)} className="text-raptor-muted hover:text-raptor-primary flex-shrink-0" title="Edit">
                            <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button aria-label="Delete" onClick={() => remove(s.id)} className="text-raptor-muted hover:text-red-500 flex-shrink-0" title="Delete">
                            <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
