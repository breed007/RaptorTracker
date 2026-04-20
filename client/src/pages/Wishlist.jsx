import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ConfirmModal from '../components/ConfirmModal'

const CATEGORIES = [
  'Lighting', 'Armor', 'Suspension', 'Wheels & Tires', 'Performance',
  'Exterior', 'Interior', 'Recovery', 'Electronics', 'Other',
]

const PRIORITIES = ['high', 'medium', 'low']

const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' }

const PRIORITY_DOT = {
  high:   'bg-red-500',
  medium: 'bg-yellow-400',
  low:    'bg-green-500',
}

const PRIORITY_TEXT = {
  high:   'text-red-500 dark:text-red-400',
  medium: 'text-yellow-500 dark:text-yellow-400',
  low:    'text-green-600 dark:text-green-400',
}

const PRIORITY_SECTION_LABEL = {
  high:   'High Priority',
  medium: 'Medium Priority',
  low:    'Low Priority',
}

const EMPTY_FORM = {
  part_name: '',
  brand: '',
  part_number: '',
  category: '',
  estimated_cost: '',
  priority: 'medium',
  vendor_name: '',
  vendor_url: '',
  notes: '',
}

function PriorityBadge({ priority }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${PRIORITY_TEXT[priority] || PRIORITY_TEXT.medium}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[priority] || PRIORITY_DOT.medium}`} />
      {PRIORITY_LABELS[priority] || priority}
    </span>
  )
}

function WishlistForm({ initialValues, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(initialValues || EMPTY_FORM)

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4">
      <h2 className="section-title">{initialValues?.id ? 'Edit Item' : 'Add Wishlist Item'}</h2>

      {error && (
        <p className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Part Name */}
        <div className="sm:col-span-2">
          <label className="label">
            Part Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.part_name}
            onChange={set('part_name')}
            placeholder="e.g. Baja Designs S8 Light Bar"
            className="input-field"
          />
        </div>

        {/* Brand */}
        <div>
          <label className="label">Brand</label>
          <input
            type="text"
            value={form.brand}
            onChange={set('brand')}
            placeholder="e.g. Baja Designs"
            className="input-field"
          />
        </div>

        {/* Part Number */}
        <div>
          <label className="label">Part Number</label>
          <input
            type="text"
            value={form.part_number}
            onChange={set('part_number')}
            placeholder="e.g. 447543"
            className="input-field"
          />
        </div>

        {/* Category */}
        <div>
          <label className="label">Category</label>
          <select value={form.category} onChange={set('category')} className="input-field">
            <option value="">Select category…</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div>
          <label className="label">Priority</label>
          <select value={form.priority} onChange={set('priority')} className="input-field">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Estimated Cost */}
        <div>
          <label className="label">Estimated Cost</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.estimated_cost}
            onChange={set('estimated_cost')}
            placeholder="0.00"
            className="input-field"
          />
        </div>

        {/* Vendor Name */}
        <div>
          <label className="label">Vendor Name</label>
          <input
            type="text"
            value={form.vendor_name}
            onChange={set('vendor_name')}
            placeholder="e.g. Amazon, Southern Style Off-Road"
            className="input-field"
          />
        </div>

        {/* Vendor URL */}
        <div className="sm:col-span-2">
          <label className="label">Vendor URL</label>
          <input
            type="url"
            value={form.vendor_url}
            onChange={set('vendor_url')}
            placeholder="https://amazon.com/dp/…"
            className="input-field"
          />
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={3}
            placeholder="Fitment notes, color, quantity, etc."
            className="input-field resize-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={saving} className="btn-primary text-sm">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function Wishlist() {
  const { selectedVehicleId, selectedVehicle } = useApp()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null) // null = adding new
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Promote state
  const [promotingId, setPromotingId] = useState(null)
  const [promoteError, setPromoteError] = useState('')

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState(null) // item to confirm delete

  const fetchItems = useCallback(() => {
    if (!selectedVehicleId) return
    setLoading(true)
    fetch(`/api/wishlist?vehicle_id=${selectedVehicleId}`)
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedVehicleId])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Reset form state when vehicle changes
  useEffect(() => {
    setShowForm(false)
    setEditItem(null)
    setFormError('')
    setPromoteError('')
  }, [selectedVehicleId])

  const openAdd = () => {
    setEditItem(null)
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setFormError('')
    setShowForm(true)
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditItem(null)
    setFormError('')
  }

  const handleSave = async (form) => {
    if (!form.part_name.trim()) {
      setFormError('Part name is required.')
      return
    }

    setSaving(true)
    setFormError('')

    const body = {
      user_vehicle_id: selectedVehicleId,
      part_name: form.part_name.trim(),
      brand: form.brand.trim() || null,
      part_number: form.part_number.trim() || null,
      category: form.category || null,
      estimated_cost: form.estimated_cost !== '' ? parseFloat(form.estimated_cost) : null,
      priority: form.priority || 'medium',
      vendor_name: form.vendor_name.trim() || null,
      vendor_url: form.vendor_url.trim() || null,
      notes: form.notes.trim() || null,
    }

    try {
      const isEdit = !!editItem?.id
      const url = isEdit ? `/api/wishlist/${editItem.id}` : '/api/wishlist'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFormError(data.error || `Failed to ${isEdit ? 'update' : 'add'} item.`)
        return
      }

      setShowForm(false)
      setEditItem(null)
      fetchItems()
    } catch {
      setFormError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handlePromote = async (item) => {
    setPromotingId(item.id)
    setPromoteError('')
    try {
      const res = await fetch(`/api/wishlist/${item.id}/promote`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setPromoteError(data.error || 'Could not promote item.')
        return
      }
      // Refresh the wishlist — item will be gone, now lives in mods
      fetchItems()
    } catch {
      setPromoteError('Network error — could not promote item.')
    } finally {
      setPromotingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/wishlist/${deleteTarget.id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteTarget(null)
        fetchItems()
      }
    } catch {
      // silently ignore — modal stays open
    }
  }

  // No vehicle selected
  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Go to Garage</Link>
      </div>
    )
  }

  // Group items by priority in display order
  const grouped = PRIORITIES.reduce((acc, p) => {
    acc[p] = items.filter(i => i.priority === p)
    return acc
  }, {})

  const totalBudget = items.reduce((sum, i) => {
    return sum + (i.estimated_cost != null ? parseFloat(i.estimated_cost) : 0)
  }, 0)

  const formInitialValues = editItem
    ? {
        ...editItem,
        estimated_cost: editItem.estimated_cost != null ? String(editItem.estimated_cost) : '',
        vendor_url: editItem.vendor_url || '',
        vendor_name: editItem.vendor_name || '',
        brand: editItem.brand || '',
        part_number: editItem.part_number || '',
        category: editItem.category || '',
        notes: editItem.notes || '',
      }
    : EMPTY_FORM

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="page-title">Wishlist</h1>
        <button onClick={openAdd} className="btn-primary text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Item
        </button>
      </div>

      {/* Promote error banner */}
      {promoteError && (
        <div className="flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          <span>{promoteError}</span>
          <button onClick={() => setPromoteError('')} className="flex-shrink-0 opacity-60 hover:opacity-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <WishlistForm
          initialValues={formInitialValues}
          onSave={handleSave}
          onCancel={cancelForm}
          saving={saving}
          error={formError}
        />
      )}

      {/* Content */}
      {loading ? (
        <div className="text-raptor-muted animate-pulse">Loading…</div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center">
          <svg className="w-10 h-10 text-raptor-muted mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <p className="text-raptor-secondary mb-4">No wishlist items yet.</p>
          <button onClick={openAdd} className="btn-primary text-sm">Add First Item</button>
        </div>
      ) : (
        <div className="space-y-6">
          {PRIORITIES.map(priority => {
            const group = grouped[priority]
            if (group.length === 0) return null

            return (
              <div key={priority}>
                {/* Priority section header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[priority]}`} />
                  <h2 className="text-sm font-semibold text-raptor-secondary uppercase tracking-wide">
                    {PRIORITY_SECTION_LABEL[priority]}
                  </h2>
                  <span className="text-xs text-raptor-muted">({group.length})</span>
                  <div className="flex-1 h-px bg-raptor-border" />
                </div>

                <div className="space-y-2">
                  {group.map(item => (
                    <div key={item.id} className="card px-4 py-3 flex items-start gap-3">
                      {/* Main content */}
                      <div className="flex-1 min-w-0 space-y-1">
                        {/* Part name + priority */}
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className="font-semibold text-raptor-primary leading-snug">{item.part_name}</span>
                          <PriorityBadge priority={item.priority} />
                        </div>

                        {/* Brand + category row */}
                        {(item.brand || item.category) && (
                          <p className="text-xs text-raptor-muted">
                            {[item.brand, item.category].filter(Boolean).join(' · ')}
                          </p>
                        )}

                        {/* Part number */}
                        {item.part_number && (
                          <p className="text-xs font-mono text-raptor-muted tracking-tight">
                            #{item.part_number}
                          </p>
                        )}

                        {/* Vendor */}
                        {item.vendor_name && (
                          <p className="text-xs text-raptor-secondary">
                            {item.vendor_url ? (
                              <a
                                href={item.vendor_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-raptor-accent hover:underline underline-offset-2 inline-flex items-center gap-1"
                              >
                                {item.vendor_name}
                                <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            ) : (
                              item.vendor_name
                            )}
                          </p>
                        )}

                        {/* Notes */}
                        {item.notes && (
                          <p className="text-xs text-raptor-muted leading-relaxed">{item.notes}</p>
                        )}
                      </div>

                      {/* Right side */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {/* Estimated cost */}
                        {item.estimated_cost != null && (
                          <span className="text-sm font-semibold text-raptor-accent tabular-nums">
                            ${parseFloat(item.estimated_cost).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-1">
                          {/* Edit */}
                          <button
                            onClick={() => openEdit(item)}
                            title="Edit"
                            className="p-1.5 rounded text-raptor-muted hover:text-raptor-primary hover:bg-raptor-elevated transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>

                          {/* Order It → promote */}
                          <button
                            onClick={() => handlePromote(item)}
                            disabled={promotingId === item.id}
                            title="Move to mods as Ordered"
                            className="px-2 py-1 rounded text-xs font-medium text-raptor-accent border border-raptor-accent/40 hover:bg-raptor-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {promotingId === item.id ? 'Moving…' : 'Order It →'}
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setDeleteTarget(item)}
                            title="Delete"
                            className="p-1.5 rounded text-raptor-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer summary */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-raptor-secondary px-1 pt-1">
          <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
          {totalBudget > 0 && (
            <span>
              Estimated budget:{' '}
              <span className="text-raptor-primary font-semibold tabular-nums">
                ${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <ConfirmModal
          title="Remove Wishlist Item"
          message={`Remove "${deleteTarget.part_name}" from your wishlist?`}
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
