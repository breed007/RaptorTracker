import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ConfirmModal from '../components/ConfirmModal'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtMoney(val) {
  if (val == null || val === '') return null
  return '$' + Number(val).toLocaleString('en-US', {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  })
}

// Returns { label, colorCls, daysLeft } for a given expiration date string
function expiryStatus(expiryDateStr) {
  if (!expiryDateStr) return null
  const today = new Date()
  const exp = new Date(expiryDateStr + 'T12:00:00')
  const days = Math.floor((exp - today) / 86400000)
  if (days < 0) {
    return { label: 'Expired', colorCls: 'bg-red-500/15 text-red-400 border-red-500/30', daysLeft: days }
  }
  if (days <= 90) {
    return { label: `Expires in ${days}d`, colorCls: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30', daysLeft: days }
  }
  return { label: `${days}d left`, colorCls: 'bg-green-500/15 text-green-500 border-green-500/30', daysLeft: days }
}

// Compute mod expiry date from start_date + warranty_months
function modExpiryDate(mod) {
  if (!mod.warranty_start_date || !mod.warranty_months) return null
  const d = new Date(mod.warranty_start_date + 'T12:00:00')
  d.setMonth(d.getMonth() + mod.warranty_months)
  return d.toISOString().split('T')[0]
}

// ── Empty form defaults ───────────────────────────────────────────────────────

const EMPTY_VW = {
  warranty_name: '',
  provider: '',
  provider_url: '',
  purchase_date: '',
  start_date: '',
  term_years: '',
  term_miles: '',
  expiration_date: '',
  deductible: '',
  cost: '',
  contract_number: '',
  claims_phone: '',
  notes: '',
}

const EMPTY_MOD_WARRANTY = {
  warranty_months: '',
  warranty_start_date: '',
  warranty_provider: '',
  warranty_notes: '',
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ expiryDateStr }) {
  const s = expiryStatus(expiryDateStr)
  if (!s) return <span className="text-xs text-raptor-muted">No expiry</span>
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${s.colorCls}`}>
      {s.label}
    </span>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function Warranty() {
  const { selectedVehicleId } = useApp()

  // Vehicle warranties
  const [vehicleWarranties, setVehicleWarranties] = useState([])
  // Mod warranties
  const [modWarranties, setModWarranties] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Vehicle warranty form
  const [showVWForm, setShowVWForm] = useState(false)
  const [editVWId, setEditVWId] = useState(null)
  const [vwForm, setVwForm] = useState(EMPTY_VW)
  const [vwSaving, setVwSaving] = useState(false)
  const [vwError, setVwError] = useState('')

  // Mod warranty edit
  const [editModId, setEditModId] = useState(null)
  const [modForm, setModForm] = useState(EMPTY_MOD_WARRANTY)
  const [modSaving, setModSaving] = useState(false)
  const [modError, setModError] = useState('')

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null) // { type: 'vehicle', id }

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(() => {
    if (!selectedVehicleId) return
    setLoading(true)
    setError('')
    Promise.all([
      fetch(`/api/warranty/vehicle?vehicle_id=${selectedVehicleId}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/warranty/mods?vehicle_id=${selectedVehicleId}`).then(r => r.ok ? r.json() : []),
    ])
      .then(([vw, mods]) => {
        setVehicleWarranties(vw)
        setModWarranties(mods)
      })
      .catch(() => setError('Failed to load warranty data'))
      .finally(() => setLoading(false))
  }, [selectedVehicleId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Vehicle warranty form handlers ─────────────────────────────────────────

  const openNewVW = () => {
    setEditVWId(null)
    setVwForm(EMPTY_VW)
    setVwError('')
    setShowVWForm(true)
    setTimeout(() => {
      document.getElementById('vw-form-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const openEditVW = (w) => {
    setEditVWId(w.id)
    setVwForm({
      warranty_name: w.warranty_name || '',
      provider: w.provider || '',
      provider_url: w.provider_url || '',
      purchase_date: w.purchase_date || '',
      start_date: w.start_date || '',
      term_years: w.term_years ?? '',
      term_miles: w.term_miles ?? '',
      expiration_date: w.expiration_date || '',
      deductible: w.deductible ?? '',
      cost: w.cost ?? '',
      contract_number: w.contract_number || '',
      claims_phone: w.claims_phone || '',
      notes: w.notes || '',
    })
    setVwError('')
    setShowVWForm(true)
    setTimeout(() => {
      document.getElementById('vw-form-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const closeVWForm = () => {
    setShowVWForm(false)
    setEditVWId(null)
    setVwError('')
  }

  const setVwField = (field, value) => setVwForm(f => ({ ...f, [field]: value }))

  const handleVWSubmit = async (e) => {
    e.preventDefault()
    setVwError('')
    if (!vwForm.warranty_name.trim()) { setVwError('Warranty name is required'); return }
    if (!vwForm.provider.trim()) { setVwError('Provider is required'); return }

    setVwSaving(true)
    const payload = {
      user_vehicle_id: selectedVehicleId,
      warranty_name: vwForm.warranty_name.trim(),
      provider: vwForm.provider.trim(),
      provider_url: vwForm.provider_url || null,
      purchase_date: vwForm.purchase_date || null,
      start_date: vwForm.start_date || null,
      term_years: vwForm.term_years !== '' ? parseInt(vwForm.term_years) : null,
      term_miles: vwForm.term_miles !== '' ? parseInt(vwForm.term_miles) : null,
      expiration_date: vwForm.expiration_date || null,
      deductible: vwForm.deductible !== '' ? parseFloat(vwForm.deductible) : null,
      cost: vwForm.cost !== '' ? parseFloat(vwForm.cost) : null,
      contract_number: vwForm.contract_number || null,
      claims_phone: vwForm.claims_phone || null,
      notes: vwForm.notes || null,
    }
    try {
      const url = editVWId ? `/api/warranty/vehicle/${editVWId}` : '/api/warranty/vehicle'
      const method = editVWId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json()
        setVwError(d.error || 'Failed to save')
      } else {
        fetchAll()
        closeVWForm()
      }
    } catch {
      setVwError('Network error — please try again')
    } finally {
      setVwSaving(false)
    }
  }

  const handleDeleteVW = async () => {
    if (!deleteTarget) return
    await fetch(`/api/warranty/vehicle/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    fetchAll()
  }

  // ── Mod warranty form handlers ─────────────────────────────────────────────

  const openEditMod = (mod) => {
    setEditModId(mod.id)
    setModForm({
      warranty_months: mod.warranty_months ?? '',
      warranty_start_date: mod.warranty_start_date || '',
      warranty_provider: mod.warranty_provider || '',
      warranty_notes: mod.warranty_notes || '',
    })
    setModError('')
  }

  const closeModForm = () => {
    setEditModId(null)
    setModError('')
  }

  const setModField = (field, value) => setModForm(f => ({ ...f, [field]: value }))

  const handleModSubmit = async (e) => {
    e.preventDefault()
    setModError('')
    setModSaving(true)
    try {
      const res = await fetch(`/api/warranty/mods/${editModId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warranty_months: modForm.warranty_months !== '' ? parseInt(modForm.warranty_months) : null,
          warranty_start_date: modForm.warranty_start_date || null,
          warranty_provider: modForm.warranty_provider || null,
          warranty_notes: modForm.warranty_notes || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setModError(d.error || 'Failed to save')
      } else {
        fetchAll()
        closeModForm()
      }
    } catch {
      setModError('Network error — please try again')
    } finally {
      setModSaving(false)
    }
  }

  // ── No vehicle guard ───────────────────────────────────────────────────────

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4 text-center">
        <svg className="w-12 h-12 text-raptor-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <p className="text-raptor-secondary">No vehicle selected. Add one in your garage first.</p>
        <Link to="/garage" className="btn-primary text-sm">Go to Garage</Link>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="page-title">Warranty</h1>
        <button onClick={openNewVW} className="btn-primary text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Warranty
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Form anchor ── */}
      <div id="vw-form-anchor" />

      {/* ── Vehicle Warranty Form ── */}
      {showVWForm && (
        <div className="card p-5">
          <div className="section-title mb-4">{editVWId ? 'Edit Warranty' : 'Add Vehicle Warranty'}</div>
          <form onSubmit={handleVWSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Warranty Name */}
            <div>
              <label className="label">Warranty Name *</label>
              <input
                type="text"
                value={vwForm.warranty_name}
                onChange={e => setVwField('warranty_name', e.target.value)}
                className="input-field"
                placeholder="e.g. Ford Protect PremiumCARE"
                required
              />
            </div>

            {/* Provider */}
            <div>
              <label className="label">Provider *</label>
              <input
                type="text"
                value={vwForm.provider}
                onChange={e => setVwField('provider', e.target.value)}
                className="input-field"
                placeholder="e.g. Ford Motor Company"
                required
              />
            </div>

            {/* Provider URL */}
            <div>
              <label className="label">Provider Website</label>
              <input
                type="url"
                value={vwForm.provider_url}
                onChange={e => setVwField('provider_url', e.target.value)}
                className="input-field"
                placeholder="https://..."
              />
            </div>

            {/* Claims Phone */}
            <div>
              <label className="label">Claims Phone</label>
              <input
                type="tel"
                value={vwForm.claims_phone}
                onChange={e => setVwField('claims_phone', e.target.value)}
                className="input-field"
                placeholder="e.g. 1-800-521-4140"
              />
            </div>

            {/* Contract Number */}
            <div>
              <label className="label">Contract / Policy Number</label>
              <input
                type="text"
                value={vwForm.contract_number}
                onChange={e => setVwField('contract_number', e.target.value)}
                className="input-field"
                placeholder="e.g. ESC-12345678"
              />
            </div>

            {/* Purchase Date */}
            <div>
              <label className="label">Purchase Date</label>
              <input
                type="date"
                value={vwForm.purchase_date}
                onChange={e => setVwField('purchase_date', e.target.value)}
                className="input-field"
              />
            </div>

            {/* Start Date */}
            <div>
              <label className="label">Coverage Start Date</label>
              <input
                type="date"
                value={vwForm.start_date}
                onChange={e => setVwField('start_date', e.target.value)}
                className="input-field"
              />
            </div>

            {/* Term Years */}
            <div>
              <label className="label">Term (years)</label>
              <input
                type="number"
                value={vwForm.term_years}
                onChange={e => setVwField('term_years', e.target.value)}
                className="input-field"
                placeholder="e.g. 5"
                min="0"
                step="1"
              />
            </div>

            {/* Term Miles */}
            <div>
              <label className="label">Term (miles)</label>
              <input
                type="number"
                value={vwForm.term_miles}
                onChange={e => setVwField('term_miles', e.target.value)}
                className="input-field"
                placeholder="e.g. 100000"
                min="0"
                step="1000"
              />
            </div>

            {/* Expiration Date */}
            <div>
              <label className="label">
                Expiration Date
                <span className="ml-1 font-normal text-raptor-muted">(auto-calculated if blank)</span>
              </label>
              <input
                type="date"
                value={vwForm.expiration_date}
                onChange={e => setVwField('expiration_date', e.target.value)}
                className="input-field"
              />
            </div>

            {/* Cost */}
            <div>
              <label className="label">Cost Paid</label>
              <input
                type="number"
                value={vwForm.cost}
                onChange={e => setVwField('cost', e.target.value)}
                className="input-field"
                placeholder="e.g. 2495"
                min="0"
                step="0.01"
              />
            </div>

            {/* Deductible */}
            <div>
              <label className="label">Deductible</label>
              <input
                type="number"
                value={vwForm.deductible}
                onChange={e => setVwField('deductible', e.target.value)}
                className="input-field"
                placeholder="e.g. 100"
                min="0"
                step="0.01"
              />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea
                value={vwForm.notes}
                onChange={e => setVwField('notes', e.target.value)}
                className="input-field"
                rows={2}
                placeholder="Coverage details, exclusions, etc."
              />
            </div>

            {vwError && (
              <div className="sm:col-span-2 text-sm text-red-500 dark:text-red-400">{vwError}</div>
            )}

            <div className="sm:col-span-2 flex gap-3">
              <button type="submit" disabled={vwSaving} className="btn-primary text-sm">
                {vwSaving ? 'Saving…' : editVWId ? 'Save Changes' : 'Add Warranty'}
              </button>
              <button type="button" onClick={closeVWForm} className="btn-secondary text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Vehicle / Extended Warranties Section ── */}
      <section>
        <h2 className="section-title mb-3">Extended &amp; Vehicle Warranties</h2>

        {loading ? (
          <div className="text-raptor-muted animate-pulse text-sm">Loading…</div>
        ) : vehicleWarranties.length === 0 ? (
          <div className="card p-8 text-center space-y-3">
            <svg className="w-10 h-10 text-raptor-muted mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-raptor-secondary text-sm">No warranties added yet.</p>
            <button onClick={openNewVW} className="btn-primary text-sm">Add First Warranty</button>
          </div>
        ) : (
          <div className="space-y-3">
            {vehicleWarranties.map(w => (
              <VehicleWarrantyCard
                key={w.id}
                warranty={w}
                onEdit={() => openEditVW(w)}
                onDelete={() => setDeleteTarget({ type: 'vehicle', id: w.id })}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Mod Warranties Section ── */}
      <section>
        <h2 className="section-title mb-3">Modification Warranties</h2>
        <p className="text-xs text-raptor-muted mb-3">
          Warranty info for your installed mods. Edit a mod row to set coverage.
        </p>

        {loading ? (
          <div className="text-raptor-muted animate-pulse text-sm">Loading…</div>
        ) : modWarranties.length === 0 ? (
          <div className="card p-6 text-center text-sm text-raptor-secondary">
            No installed mods found.{' '}
            <Link to="/mods" className="text-raptor-accent hover:underline">Add mods</Link> to track their warranties here.
          </div>
        ) : (
          <div className="space-y-3">
            {modWarranties.map(mod => (
              <ModWarrantyRow
                key={mod.id}
                mod={mod}
                isEditing={editModId === mod.id}
                modForm={modForm}
                modError={modError}
                modSaving={modSaving}
                onEdit={() => openEditMod(mod)}
                onCancel={closeModForm}
                onSubmit={handleModSubmit}
                setModField={setModField}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Delete confirmation ── */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Warranty"
          message="Delete this warranty record? This cannot be undone."
          danger
          onConfirm={handleDeleteVW}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ── Vehicle Warranty Card ─────────────────────────────────────────────────────

function VehicleWarrantyCard({ warranty: w, onEdit, onDelete }) {
  const expiryDate = w.expiration_date
  const status = expiryDate ? expiryStatus(expiryDate) : null

  const termStr = [
    w.term_years ? `${w.term_years} yr` : null,
    w.term_miles ? `${Number(w.term_miles).toLocaleString()} mi` : null,
  ].filter(Boolean).join(' / ')

  return (
    <div className={`card p-4 border-l-4 ${
      status?.daysLeft != null && status.daysLeft < 0
        ? 'border-l-red-500'
        : status?.daysLeft != null && status.daysLeft <= 90
          ? 'border-l-yellow-500'
          : 'border-l-green-500'
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Name + status */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-raptor-primary">{w.warranty_name}</span>
            {expiryDate && <StatusBadge expiryDateStr={expiryDate} />}
          </div>

          {/* Provider */}
          <div className="text-sm text-raptor-secondary">
            {w.provider_url ? (
              <a
                href={w.provider_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-raptor-accent hover:underline"
              >
                {w.provider}
              </a>
            ) : w.provider}
          </div>

          {/* Meta grid */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {termStr && (
              <span className="text-raptor-secondary">
                Term: <span className="text-raptor-primary font-medium">{termStr}</span>
              </span>
            )}
            {w.start_date && (
              <span className="text-raptor-secondary">
                Start: <span className="text-raptor-primary">{fmtDate(w.start_date)}</span>
              </span>
            )}
            {expiryDate && (
              <span className="text-raptor-secondary">
                Expires: <span className="text-raptor-primary">{fmtDate(expiryDate)}</span>
              </span>
            )}
            {w.deductible != null && (
              <span className="text-raptor-secondary">
                Deductible: <span className="text-raptor-primary">{fmtMoney(w.deductible) ?? '—'}</span>
              </span>
            )}
            {w.cost != null && (
              <span className="text-raptor-secondary">
                Cost: <span className="text-raptor-primary">{fmtMoney(w.cost) ?? '—'}</span>
              </span>
            )}
          </div>

          {/* Contract + Phone */}
          {(w.contract_number || w.claims_phone) && (
            <div className="flex flex-wrap gap-4 text-xs text-raptor-muted">
              {w.contract_number && <span>Contract: {w.contract_number}</span>}
              {w.claims_phone && (
                <span>
                  Claims:{' '}
                  <a href={`tel:${w.claims_phone}`} className="text-raptor-accent hover:underline">
                    {w.claims_phone}
                  </a>
                </span>
              )}
            </div>
          )}

          {/* Notes */}
          {w.notes && (
            <p className="text-sm text-raptor-secondary whitespace-pre-wrap">{w.notes}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="text-raptor-muted hover:text-raptor-primary p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
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
    </div>
  )
}

// ── Mod Warranty Row ──────────────────────────────────────────────────────────

function ModWarrantyRow({ mod, isEditing, modForm, modError, modSaving, onEdit, onCancel, onSubmit, setModField }) {
  const expiryDate = modExpiryDate(mod)
  const hasWarranty = mod.warranty_months || mod.warranty_start_date || mod.warranty_provider

  return (
    <div className="card p-4">
      {isEditing ? (
        // ── Edit form inline ──
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="font-semibold text-raptor-primary text-sm mb-1">{mod.part_name}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Provider</label>
              <input
                type="text"
                value={modForm.warranty_provider}
                onChange={e => setModField('warranty_provider', e.target.value)}
                className="input-field"
                placeholder="e.g. Fox Racing Shox"
              />
            </div>
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                value={modForm.warranty_start_date}
                onChange={e => setModField('warranty_start_date', e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Term (months)</label>
              <input
                type="number"
                value={modForm.warranty_months}
                onChange={e => setModField('warranty_months', e.target.value)}
                className="input-field"
                placeholder="e.g. 12"
                min="0"
                step="1"
              />
            </div>
            <div>
              <label className="label">Notes</label>
              <input
                type="text"
                value={modForm.warranty_notes}
                onChange={e => setModField('warranty_notes', e.target.value)}
                className="input-field"
                placeholder="Registration required, etc."
              />
            </div>
          </div>
          {modError && <div className="text-sm text-red-500">{modError}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={modSaving} className="btn-primary text-sm">
              {modSaving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onCancel} className="btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        // ── Display row ──
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-raptor-primary">{mod.part_name}</span>
              {mod.brand && <span className="text-xs text-raptor-muted">{mod.brand}</span>}
              {mod.category && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-raptor-elevated border border-raptor-border text-raptor-muted">
                  {mod.category}
                </span>
              )}
              {hasWarranty && expiryDate && <StatusBadge expiryDateStr={expiryDate} />}
              {!hasWarranty && (
                <span className="text-xs text-raptor-muted italic">No warranty set</span>
              )}
            </div>

            {hasWarranty && (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-raptor-secondary">
                {mod.warranty_provider && <span>{mod.warranty_provider}</span>}
                {mod.warranty_months && (
                  <span>{mod.warranty_months} month{mod.warranty_months !== 1 ? 's' : ''}</span>
                )}
                {mod.warranty_start_date && <span>Start: {fmtDate(mod.warranty_start_date)}</span>}
                {expiryDate && <span>Expires: {fmtDate(expiryDate)}</span>}
                {mod.warranty_notes && (
                  <span className="text-raptor-muted">{mod.warranty_notes}</span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={onEdit}
            className="text-raptor-muted hover:text-raptor-primary p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors flex-shrink-0"
            title="Set warranty"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
