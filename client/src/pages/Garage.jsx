import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ConfirmModal from '../components/ConfirmModal'

// Valid VIN: 17 chars, no I O Q
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/

const EMPTY_FORM = {
  vehicle_id: '', nickname: '', model_year: '', color: '',
  vin: '', purchase_date: '', mileage_at_purchase: '', package_options: '', notes: '',
  purchase_price: '', seller_name: '', seller_contact: '',
  service_dealership: '', service_dealership_contact: ''
}

// ── Icons ──────────────────────────────────────────────────────────────────

function SearchIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
    </svg>
  )
}

function SpinIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function FileIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function CheckCircleIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

// ── Vehicle Photo Modal ────────────────────────────────────────────────────

function VehiclePhotoModal({ vehicle, onClose, onRefresh }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const photos = vehicle.vehicle_photos || []
  const profilePhoto = vehicle.profile_photo

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    setError('')
    const formData = new FormData()
    files.forEach(f => formData.append('photos', f))
    try {
      const res = await fetch(`/api/user-vehicles/${vehicle.id}/photos`, { method: 'POST', body: formData })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Upload failed') }
      else await onRefresh()
    } catch { setError('Upload failed — check your connection') }
    finally { setUploading(false) }
  }

  const handleRemove = async (photoPath) => {
    const filename = photoPath.split('/').pop()
    try {
      const res = await fetch(`/api/user-vehicles/${vehicle.id}/photos/${filename}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Remove failed') }
      else await onRefresh()
    } catch { setError('Remove failed') }
  }

  const handleSetProfile = async (photoPath) => {
    try {
      const res = await fetch(`/api/user-vehicles/${vehicle.id}/profile-photo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: photoPath })
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed') }
      else await onRefresh()
    } catch { setError('Failed to set profile photo') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-raptor-card border border-raptor-border rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-raptor-border flex-shrink-0">
          <div>
            <div className="font-display font-bold text-raptor-primary">{vehicle.nickname}</div>
            <div className="text-xs text-raptor-muted mt-0.5">Vehicle Photos · {photos.length} {photos.length === 1 ? 'photo' : 'photos'}</div>
          </div>
          <button onClick={onClose} className="text-raptor-muted hover:text-raptor-primary transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Upload button */}
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.tiff,.tif,.heic"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <button
            onClick={() => { inputRef.current.value = ''; inputRef.current.click() }}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-raptor-border text-sm text-raptor-secondary hover:border-raptor-accent hover:text-raptor-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? <SpinIcon className="w-4 h-4" /> : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            )}
            {uploading ? 'Uploading…' : 'Upload Photos'}
            {!uploading && <span className="text-raptor-muted text-xs">JPEG, PNG, WEBP, TIFF, HEIC</span>}
          </button>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {/* Photo grid */}
          {photos.length === 0 ? (
            <div className="text-center py-10 text-raptor-muted text-sm">
              No photos uploaded yet. Add some above.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map(photoPath => {
                const isProfile = photoPath === profilePhoto
                return (
                  <div
                    key={photoPath}
                    className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${
                      isProfile ? 'border-raptor-accent' : 'border-transparent hover:border-raptor-border'
                    }`}
                  >
                    <img src={photoPath} alt="" className="w-full aspect-video object-cover bg-raptor-elevated" />
                    {/* Profile badge */}
                    {isProfile && (
                      <div className="absolute top-1.5 left-1.5 bg-raptor-accent text-white text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        Profile
                      </div>
                    )}
                    {/* Hover overlay with actions */}
                    <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-end justify-end p-2 gap-1.5">
                      {!isProfile && (
                        <button
                          onClick={() => handleSetProfile(photoPath)}
                          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-white/20 hover:bg-white/30 text-white border border-white/25 rounded-md py-1.5 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          Set as Profile
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(photoPath)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-red-500/80 hover:bg-red-600/90 text-white border border-red-400/30 rounded-md py-1.5 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Remove
                      </button>
                    </div>
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

// ── VIN Result Card ────────────────────────────────────────────────────────

function VinResultCard({ result, autoFilled }) {
  const titleParts = [result.year, result.make, result.model].filter(Boolean)
  const subParts   = [result.series, result.trim].filter(Boolean)

  return (
    <div className="mt-3 rounded-lg border border-raptor-border bg-raptor-elevated p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-raptor-primary leading-tight">
            {titleParts.length ? titleParts.join(' ') : 'Vehicle Identified'}
          </div>
          {subParts.length > 0 && (
            <div className="text-xs text-raptor-secondary mt-0.5 truncate">
              {subParts.join(' · ')}
            </div>
          )}
        </div>
        {result.generation && (
          <span className="bg-ford-navy/10 dark:bg-raptor-orange/15 text-raptor-accent text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0">
            {result.generation}
          </span>
        )}
      </div>

      {/* Engine */}
      {result.engineDesc && (
        <div className="text-xs text-raptor-secondary">
          <span className="text-raptor-muted font-medium">Engine: </span>
          {result.engineDesc}
        </div>
      )}

      {/* Auto-fill confirmation */}
      {autoFilled.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
          Auto-filled: {autoFilled.join(', ')}
        </div>
      )}

      {/* Window sticker link */}
      <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 pt-0.5 border-t border-raptor-border">
        {result.isFord && (
          <a
            href={result.windowStickerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-raptor-accent hover:underline font-medium"
          >
            <FileIcon className="w-3.5 h-3.5" />
            View Window Sticker PDF
          </a>
        )}
        {!result.nhtsaAvailable && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            ⚠ NHTSA lookup unavailable — year decoded from VIN only
          </span>
        )}
        {result.errorText && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            ⚠ {result.errorText}
          </span>
        )}
        {!result.refVehicleId && result.nhtsaAvailable && (
          <span className="text-xs text-raptor-muted italic">
            Vehicle type not auto-selected — please choose from the list below
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function Garage() {
  const { userVehicles, setUserVehicles, selectVehicle } = useApp()
  const [refVehicles, setRefVehicles] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // VIN decode state
  const [vinLoading, setVinLoading] = useState(false)
  const [vinResult, setVinResult] = useState(null)
  const [vinError, setVinError] = useState('')
  const [vinAutoFilled, setVinAutoFilled] = useState([])

  // Photo modal state
  const [photoModalVehicle, setPhotoModalVehicle] = useState(null)

  // Import / export state
  const [transferMenuOpen, setTransferMenuOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const importInputRef = useRef(null)
  const transferMenuRef = useRef(null)

  const refreshVehicles = async () => {
    const updated = await fetch('/api/user-vehicles').then(r => r.json())
    setUserVehicles(updated)
    // Keep modal vehicle in sync
    if (photoModalVehicle) {
      const fresh = updated.find(v => v.id === photoModalVehicle.id)
      if (fresh) setPhotoModalVehicle(fresh)
    }
  }

  // Close transfer menu on outside click
  useEffect(() => {
    if (!transferMenuOpen) return
    const handler = (e) => {
      if (transferMenuRef.current && !transferMenuRef.current.contains(e.target)) {
        setTransferMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [transferMenuOpen])

  const handleExportVehicle = useCallback((vehicleId, nickname) => {
    const date = new Date().toISOString().slice(0, 10)
    const safeName = (nickname || 'vehicle').replace(/[^a-z0-9]/gi, '-')
    const a = document.createElement('a')
    a.href = `/api/user-vehicles/${vehicleId}/export`
    a.download = `${safeName}-${date}.zip`
    a.click()
  }, [])

  const handleImportClick = () => {
    setTransferMenuOpen(false)
    importInputRef.current.value = ''
    importInputRef.current.click()
  }

  const handleImportFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/user-vehicles/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setImportResult({ error: data.error || 'Import failed' })
      } else {
        await refreshVehicles()
        setImportResult({ success: true, ...data })
      }
    } catch {
      setImportResult({ error: 'Import failed — check your connection' })
    } finally {
      setImporting(false)
    }
  }

  // Window sticker state
  const stickerInputRef = useRef(null)
  const [stickerTarget, setStickerTarget] = useState(null)
  const [stickerUploading, setStickerUploading] = useState(null)
  const [stickerError, setStickerError] = useState('')

  useEffect(() => {
    fetch('/api/vehicles').then(r => r.json()).then(setRefVehicles)
  }, [])

  // ── VIN handlers ──────────────────────────────────────────────────────────

  const handleVinChange = (raw) => {
    // Auto-uppercase and strip disallowed chars
    const val = raw.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '')
    setForm(f => ({ ...f, vin: val }))
    // Clear previous result when VIN changes
    if (vinResult) { setVinResult(null); setVinAutoFilled([]) }
    setVinError('')
  }

  const handleVinDecode = async () => {
    const vin = form.vin.toUpperCase()
    if (!VIN_RE.test(vin)) return
    setVinLoading(true)
    setVinError('')
    setVinResult(null)
    setVinAutoFilled([])
    try {
      const res = await fetch(`/api/vin/${vin}`)
      const data = await res.json()
      if (!res.ok) {
        setVinError(data.error || 'VIN lookup failed')
        return
      }
      setVinResult(data)

      // Auto-fill empty form fields from decode result
      const filled = []
      setForm(f => {
        const next = { ...f }
        if (data.year && !f.model_year) {
          next.model_year = String(data.year)
          filled.push('Model Year')
        }
        if (data.refVehicleId && !f.vehicle_id) {
          next.vehicle_id = String(data.refVehicleId)
          filled.push('Vehicle Model')
        }
        return next
      })
      setVinAutoFilled(filled)
    } catch {
      setVinError('VIN lookup service unavailable — check your connection')
    } finally {
      setVinLoading(false)
    }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────

  const handleEdit = (v) => {
    setEditId(v.id)
    setForm({
      vehicle_id: String(v.vehicle_id),
      nickname: v.nickname || '',
      model_year: String(v.model_year || ''),
      color: v.color || '',
      vin: v.vin || '',
      purchase_date: v.purchase_date || '',
      mileage_at_purchase: v.mileage_at_purchase != null ? String(v.mileage_at_purchase) : '',
      package_options: v.package_options || '',
      notes: v.notes || '',
      purchase_price: v.purchase_price != null ? String(v.purchase_price) : '',
      seller_name: v.seller_name || '',
      seller_contact: v.seller_contact || '',
      service_dealership: v.service_dealership || '',
      service_dealership_contact: v.service_dealership_contact || '',
    })
    setVinResult(null)
    setVinAutoFilled([])
    setVinError('')
    setShowForm(true)
  }

  // ── Form submit ────────────────────────────────────────────────────────────

  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editId) {
        const res = await fetch(`/api/user-vehicles/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
        if (!res.ok) {
          const d = await res.json()
          setError(d.error || 'Error saving vehicle')
        } else {
          await refreshVehicles()
          setShowForm(false)
          setEditId(null)
          setForm(EMPTY_FORM)
          setVinResult(null)
          setVinAutoFilled([])
          setVinError('')
        }
      } else {
        const res = await fetch('/api/user-vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
        if (!res.ok) {
          const d = await res.json()
          setError(d.error || 'Error saving vehicle')
        } else {
          const created = await res.json()
          await refreshVehicles()
          selectVehicle(created.id)
          setShowForm(false)
          setForm(EMPTY_FORM)
          setVinResult(null)
          setVinAutoFilled([])
          setVinError('')
        }
      }
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await fetch(`/api/user-vehicles/${deleteTarget}`, { method: 'DELETE' })
    const updated = await fetch('/api/user-vehicles').then(r => r.json())
    setUserVehicles(updated)
    if (updated.length > 0) selectVehicle(updated[0].id)
    setDeleteTarget(null)
  }

  // ── Window sticker handlers ────────────────────────────────────────────────

  const handleStickerClick = (vehicleId) => {
    setStickerTarget(vehicleId)
    setStickerError('')
    stickerInputRef.current.value = ''
    stickerInputRef.current.click()
  }

  const handleStickerFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file || !stickerTarget) return
    setStickerUploading(stickerTarget)
    setStickerError('')
    const formData = new FormData()
    formData.append('sticker', file)
    try {
      const res = await fetch(`/api/user-vehicles/${stickerTarget}/window-sticker`, {
        method: 'POST',
        body: formData
      })
      if (!res.ok) {
        const d = await res.json()
        setStickerError(d.error || 'Upload failed')
      } else {
        await refreshVehicles()
      }
    } catch {
      setStickerError('Upload failed — check your connection')
    } finally {
      setStickerUploading(null)
      setStickerTarget(null)
    }
  }

  const handleStickerRemove = async (vehicleId) => {
    setStickerError('')
    try {
      await fetch(`/api/user-vehicles/${vehicleId}/window-sticker`, { method: 'DELETE' })
      await refreshVehicles()
    } catch {
      setStickerError('Failed to remove sticker')
    }
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditId(null)
    setForm(EMPTY_FORM)
    setVinResult(null)
    setVinAutoFilled([])
    setVinError('')
  }

  // Derived
  const vinUpper   = form.vin.toUpperCase()
  const vinValid   = VIN_RE.test(vinUpper)
  const vinPartial = form.vin.length > 0 && form.vin.length < 17
  const vinDecoded = !!vinResult

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">My Garage</h1>
        <div className="flex items-center gap-2">
          {/* Import / Export dropdown */}
          <div className="relative" ref={transferMenuRef}>
            <button
              onClick={() => setTransferMenuOpen(o => !o)}
              disabled={importing}
              className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {importing ? (
                <SpinIcon className="w-4 h-4" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              )}
              {importing ? 'Importing…' : 'Import / Export'}
              <svg className={`w-3.5 h-3.5 transition-transform ${transferMenuOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {transferMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-raptor-card border border-raptor-border rounded-lg shadow-xl py-1 w-48">
                <div className="px-3 py-1.5 text-xs font-semibold text-raptor-muted uppercase tracking-wide border-b border-raptor-border">
                  Import
                </div>
                <button
                  onClick={handleImportClick}
                  className="w-full text-left px-4 py-2 text-sm text-raptor-secondary hover:bg-raptor-elevated transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import Vehicle
                </button>
                {userVehicles.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-semibold text-raptor-muted uppercase tracking-wide border-t border-b border-raptor-border mt-1">
                      Export
                    </div>
                    {userVehicles.map(v => (
                      <button
                        key={v.id}
                        onClick={() => { setTransferMenuOpen(false); handleExportVehicle(v.id, v.nickname) }}
                        className="w-full text-left px-4 py-2 text-sm text-raptor-secondary hover:bg-raptor-elevated transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {v.nickname}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Vehicle
          </button>
        </div>
      </div>

      {/* Hidden import file input */}
      <input
        ref={importInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleImportFile}
      />

      {/* Import result banner */}
      {importResult && (
        <div className={`flex items-start justify-between gap-3 px-4 py-3 rounded-lg text-sm ${
          importResult.error
            ? 'bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400'
            : 'bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400'
        }`}>
          <span>
            {importResult.error
              ? importResult.error
              : `"${importResult.nickname}" imported — ${importResult.modsImported} mod${importResult.modsImported !== 1 ? 's' : ''}, ${importResult.maintImported} maintenance record${importResult.maintImported !== 1 ? 's' : ''}.`
            }
          </span>
          <button onClick={() => setImportResult(null)} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {showForm && (
        <div className="card p-5">
          <div className="section-title mb-4">{editId ? 'Edit Vehicle' : 'Register a Vehicle'}</div>
          <form onSubmit={handleAdd} className="space-y-4">

            {/* ── VIN field (full width, first) ───────────────────────────── */}
            <div>
              <label className="label">VIN</label>
              <div className="flex gap-2 items-start">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={form.vin}
                    onChange={e => handleVinChange(e.target.value)}
                    className={[
                      'input-field font-mono uppercase pr-16 tracking-wider',
                      vinValid
                        ? 'border-green-500 dark:border-green-600'
                        : form.vin.length > 0
                          ? 'border-amber-400 dark:border-amber-600'
                          : ''
                    ].join(' ')}
                    placeholder="17-character VIN"
                    maxLength={17}
                    spellCheck={false}
                  />
                  {/* Character count / status */}
                  <span className={[
                    'absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium select-none',
                    vinValid ? 'text-green-600 dark:text-green-400' : 'text-raptor-muted'
                  ].join(' ')}>
                    {vinValid ? '✓ valid' : `${form.vin.length}/17`}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleVinDecode}
                  disabled={!vinValid || vinLoading}
                  className={[
                    'btn-secondary text-sm whitespace-nowrap flex items-center gap-2 flex-shrink-0',
                    (!vinValid || vinLoading) ? 'opacity-40 cursor-not-allowed' : ''
                  ].join(' ')}
                >
                  {vinLoading ? <SpinIcon /> : <SearchIcon />}
                  {vinLoading ? 'Looking up…' : vinDecoded ? 'Re-decode' : 'Decode VIN'}
                </button>
              </div>

              {/* Helper text */}
              {vinPartial && !vinValid && (
                <p className="mt-1 text-xs text-raptor-muted">
                  Enter all 17 characters to decode. Letters I, O, and Q are not used in VINs.
                </p>
              )}
              {vinError && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{vinError}</p>
              )}

              {/* Decode result card */}
              {vinResult && (
                <VinResultCard result={vinResult} autoFilled={vinAutoFilled} />
              )}
            </div>

            {/* ── Two-column grid for remaining fields ──────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div>
                <label className="label">Vehicle Model {!editId && '*'}</label>
                <select
                  value={form.vehicle_id}
                  onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
                  className={`input-field ${editId ? 'opacity-60 cursor-not-allowed' : ''}`}
                  required={!editId}
                  disabled={!!editId}
                >
                  <option value="">Select a Raptor…</option>
                  {refVehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.make} {v.model} {v.generation}{v.variant ? ` (${v.variant})` : ''} — {v.model_year_start}–{v.model_year_end || 'present'}
                    </option>
                  ))}
                </select>
                {editId && <p className="mt-1 text-xs text-raptor-muted">Vehicle model cannot be changed after creation.</p>}
              </div>

              <div>
                <label className="label">Nickname *</label>
                <input
                  type="text"
                  value={form.nickname}
                  onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
                  className="input-field"
                  placeholder="e.g. Carbonized Raptor"
                  required
                />
              </div>

              <div>
                <label className="label">Model Year {!editId && '*'}</label>
                <input
                  type="number"
                  value={form.model_year}
                  onChange={e => setForm(f => ({ ...f, model_year: e.target.value }))}
                  className={`input-field ${editId ? 'opacity-60 cursor-not-allowed' : ''}`}
                  placeholder="2025"
                  min="2010"
                  max="2030"
                  required={!editId}
                  disabled={!!editId}
                />
              </div>

              <div>
                <label className="label">Color</label>
                <input
                  type="text"
                  value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="input-field"
                  placeholder="e.g. Carbonized Gray"
                />
              </div>

              <div>
                <label className="label">Mileage at Purchase</label>
                <input
                  type="number"
                  value={form.mileage_at_purchase}
                  onChange={e => setForm(f => ({ ...f, mileage_at_purchase: e.target.value }))}
                  className="input-field"
                  placeholder="0"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="label">Package / Options</label>
                <input
                  type="text"
                  value={form.package_options}
                  onChange={e => setForm(f => ({ ...f, package_options: e.target.value }))}
                  className="input-field"
                  placeholder="e.g. 802A, 37-inch package, Recaro seats"
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

              {/* ── Purchase & Seller ─────────────────────────────────────── */}
              <div className="sm:col-span-2 pt-2 border-t border-raptor-border">
                <div className="text-xs font-semibold text-raptor-muted uppercase tracking-wide mb-3">Purchase & Seller</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Purchase Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-raptor-muted text-sm">$</span>
                      <input
                        type="number"
                        value={form.purchase_price}
                        onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))}
                        className="input-field pl-7"
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Purchase Date</label>
                    <input
                      type="date"
                      value={form.purchase_date}
                      onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                      className="input-field"
                    />
                  </div>

                  <div>
                    <label className="label">Seller Name</label>
                    <input
                      type="text"
                      value={form.seller_name}
                      onChange={e => setForm(f => ({ ...f, seller_name: e.target.value }))}
                      className="input-field"
                      placeholder="e.g. Westway Ford"
                    />
                  </div>

                  <div>
                    <label className="label">Seller Contact</label>
                    <input
                      type="text"
                      value={form.seller_contact}
                      onChange={e => setForm(f => ({ ...f, seller_contact: e.target.value }))}
                      className="input-field"
                      placeholder="Phone, email, or address"
                    />
                  </div>
                </div>
              </div>

              {/* ── Service Dealership ────────────────────────────────────── */}
              <div className="sm:col-span-2 pt-2 border-t border-raptor-border">
                <div className="text-xs font-semibold text-raptor-muted uppercase tracking-wide mb-3">Service Dealership</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Dealership Name</label>
                    <input
                      type="text"
                      value={form.service_dealership}
                      onChange={e => setForm(f => ({ ...f, service_dealership: e.target.value }))}
                      className="input-field"
                      placeholder="e.g. Classic Ford of Austin"
                    />
                  </div>

                  <div>
                    <label className="label">Dealership Contact</label>
                    <input
                      type="text"
                      value={form.service_dealership_contact}
                      onChange={e => setForm(f => ({ ...f, service_dealership_contact: e.target.value }))}
                      className="input-field"
                      placeholder="Phone, email, or address"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="sm:col-span-2 text-red-600 dark:text-red-400 text-sm">{error}</div>
              )}

              <div className="sm:col-span-2 flex gap-3">
                <button type="submit" disabled={saving} className="btn-primary text-sm">
                  {saving ? (editId ? 'Saving…' : 'Adding…') : (editId ? 'Save Changes' : 'Add Vehicle')}
                </button>
                <button type="button" onClick={handleCancelForm} className="btn-secondary text-sm">
                  Cancel
                </button>
              </div>

            </div>
          </form>
        </div>
      )}

      {/* Hidden file input for sticker uploads */}
      <input
        ref={stickerInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.tiff,.tif,.pdf"
        className="hidden"
        onChange={handleStickerFileChange}
      />

      {stickerError && (
        <div className="text-sm text-red-600 dark:text-red-400">{stickerError}</div>
      )}

      {/* ── Vehicle cards ───────────────────────────────────────────────── */}
      {userVehicles.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-raptor-secondary mb-4">No vehicles registered yet.</p>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
            Register Your Raptor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {userVehicles.map(v => (
            <div key={v.id} className="card overflow-hidden flex flex-col">
              {/* ── Profile photo header ─────────────────────────────────── */}
              <div
                className="relative h-44 bg-raptor-elevated flex-shrink-0 cursor-pointer group"
                onClick={() => setPhotoModalVehicle(v)}
                title="Manage vehicle photos"
              >
                {v.profile_photo ? (
                  <img
                    src={v.profile_photo}
                    alt={v.nickname}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-raptor-muted/40">
                    <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs">Click to add photos</span>
                  </div>
                )}
                {/* Gradient overlay on photos */}
                {v.profile_photo && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                )}
                {/* Photo count badge */}
                {(v.vehicle_photos?.length || 0) > 0 && (
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                    {v.vehicle_photos.length} {v.vehicle_photos.length === 1 ? 'photo' : 'photos'}
                  </div>
                )}
                {/* Camera icon on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                  <div className="bg-black/60 text-white rounded-full p-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* ── Card body ────────────────────────────────────────────── */}
              <div className="p-5 flex flex-col gap-3 flex-1">
              <div>
                <div className="text-lg font-display font-bold text-raptor-primary">{v.nickname}</div>
                <div className="text-sm text-raptor-secondary">{v.model_year} {v.make} {v.model}</div>
                <div className="text-xs text-raptor-muted">
                  {v.generation}{v.color ? ` · ${v.color}` : ''}
                  {v.vin ? ` · ${v.vin}` : ''}
                </div>
              </div>
              <div className="flex gap-4 text-sm flex-wrap">
                <div>
                  <span className="text-raptor-accent font-bold">{v.mod_count}</span>
                  <span className="text-raptor-muted ml-1">mods</span>
                </div>
                <div>
                  <span className="text-raptor-primary font-semibold">
                    ${parseFloat(v.total_spend || 0).toLocaleString()}
                  </span>
                  <span className="text-raptor-muted ml-1">installed</span>
                </div>
                {v.purchase_price != null && (
                  <div>
                    <span className="text-raptor-primary font-semibold">
                      ${parseFloat(v.purchase_price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-raptor-muted ml-1">paid</span>
                  </div>
                )}
              </div>

              {/* Purchase / Seller / Service info */}
              {(v.purchase_date || v.seller_name || v.seller_contact || v.service_dealership || v.service_dealership_contact) && (
                <div className="pt-2 border-t border-raptor-border space-y-1">
                  {v.purchase_date && (
                    <div className="flex gap-1.5 text-xs">
                      <span className="text-raptor-muted w-20 flex-shrink-0">Purchased</span>
                      <span className="text-raptor-secondary">{new Date(v.purchase_date + 'T12:00:00').toLocaleDateString()}</span>
                    </div>
                  )}
                  {v.seller_name && (
                    <div className="flex gap-1.5 text-xs">
                      <span className="text-raptor-muted w-20 flex-shrink-0">Seller</span>
                      <span className="text-raptor-secondary truncate">{v.seller_name}</span>
                    </div>
                  )}
                  {v.seller_contact && (
                    <div className="flex gap-1.5 text-xs">
                      <span className="text-raptor-muted w-20 flex-shrink-0">Seller contact</span>
                      <span className="text-raptor-secondary truncate">{v.seller_contact}</span>
                    </div>
                  )}
                  {v.service_dealership && (
                    <div className="flex gap-1.5 text-xs">
                      <span className="text-raptor-muted w-20 flex-shrink-0">Service</span>
                      <span className="text-raptor-secondary truncate">{v.service_dealership}</span>
                    </div>
                  )}
                  {v.service_dealership_contact && (
                    <div className="flex gap-1.5 text-xs">
                      <span className="text-raptor-muted w-20 flex-shrink-0">Service tel</span>
                      <span className="text-raptor-secondary truncate">{v.service_dealership_contact}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Window sticker section */}
              <div className="pt-2 border-t border-raptor-border">
                <div className="text-xs font-medium text-raptor-muted mb-1.5">Window Sticker</div>
                {v.window_sticker ? (
                  <div className="flex gap-2 flex-wrap items-center">
                    <a
                      href={v.window_sticker}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-xs flex items-center gap-1.5"
                    >
                      <FileIcon className="w-3.5 h-3.5" />
                      View Sticker
                    </a>
                    <button
                      onClick={() => handleStickerClick(v.id)}
                      disabled={stickerUploading === v.id}
                      className="btn-secondary text-xs px-3"
                      title="Replace window sticker"
                    >
                      {stickerUploading === v.id ? 'Uploading…' : 'Replace'}
                    </button>
                    <button
                      onClick={() => handleStickerRemove(v.id)}
                      className="btn-secondary text-xs px-3 text-red-500"
                      title="Remove window sticker"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleStickerClick(v.id)}
                    disabled={stickerUploading === v.id}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    {stickerUploading === v.id ? (
                      <SpinIcon className="w-3.5 h-3.5" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    )}
                    {stickerUploading === v.id ? 'Uploading…' : 'Upload Sticker'}
                  </button>
                )}
              </div>

              <div className="flex gap-2 flex-wrap mt-auto">
                <Link to={`/mods?vehicle_id=${v.id}`} className="btn-primary text-xs flex-1 text-center">
                  View Mods
                </Link>
                <button
                  onClick={() => handleEdit(v)}
                  className="btn-secondary text-xs px-3"
                  title="Edit vehicle"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => setDeleteTarget(v.id)}
                  className="btn-secondary text-xs px-3"
                  title="Remove vehicle"
                >
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              </div>{/* end card body */}
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Remove Vehicle"
          message="This will permanently delete this vehicle and all its mods and maintenance records. This cannot be undone."
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {photoModalVehicle && (
        <VehiclePhotoModal
          vehicle={photoModalVehicle}
          onClose={() => setPhotoModalVehicle(null)}
          onRefresh={refreshVehicles}
        />
      )}
    </div>
  )
}
