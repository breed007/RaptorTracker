import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import BuildSheet from '../components/BuildSheet'
import BuildTimeline from '../components/BuildTimeline'
import ModDetailPanel from '../components/ModDetailPanel'

const CATEGORIES = ['Suspension','Tires_Wheels','Lighting','Bumpers','Armor','Engine','Performance','Interior','Audio','Electrical','Recovery','Bed_Accessories','Other']
const STATUSES = ['Researching','Ordered','In_Transit','Installed','Removed']

const VIEWS = [
  { id: 'list',      label: 'List' },
  { id: 'buildsheet', label: 'Build Sheet' },
  { id: 'timeline',  label: 'Timeline' },
]

export default function ModList() {
  const { selectedVehicleId, selectedVehicle, userVehicles, selectVehicle } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const [allMods, setAllMods] = useState([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('list')

  // List-view filters (client-side)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [sortField, setSortField] = useState('updated_at')
  const [sortDir, setSortDir] = useState('desc')

  // Detail panel state
  const [detailModId, setDetailModId] = useState(null)

  // Import / export state
  const [transferMenuOpen, setTransferMenuOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null) // { imported, skipped, total } | { error }
  const importInputRef = useRef(null)
  const transferMenuRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (transferMenuRef.current && !transferMenuRef.current.contains(e.target)) {
        setTransferMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const vid = searchParams.get('vehicle_id')
    if (vid && parseInt(vid) !== selectedVehicleId) {
      const found = userVehicles.find(v => v.id === parseInt(vid))
      if (found) selectVehicle(found.id)
    }
  }, [searchParams, userVehicles])

  const fetchMods = useCallback(() => {
    if (!selectedVehicleId) return
    setLoading(true)
    fetch(`/api/mods?vehicle_id=${selectedVehicleId}`)
      .then(r => r.json())
      .then(data => { setAllMods(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedVehicleId])

  useEffect(() => { fetchMods() }, [fetchMods])

  // Client-side filtering for list view
  const filtered = allMods.filter(m => {
    if (category && m.category !== category) return false
    if (status && m.status !== status) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        m.part_name?.toLowerCase().includes(q) ||
        m.brand?.toLowerCase().includes(q) ||
        m.vendor?.toLowerCase().includes(q) ||
        m.part_number?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortField], bv = b[sortField]
    if (av == null) av = ''
    if (bv == null) bv = ''
    if (sortField === 'cost') { av = parseFloat(av) || 0; bv = parseFloat(bv) || 0 }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalCost = sorted.reduce((s, m) => s + (m.cost || 0), 0)
  const installedCost = sorted.filter(m => m.status === 'Installed').reduce((s, m) => s + (m.cost || 0), 0)

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="text-raptor-muted ml-1">↕</span>
    return <span className="text-raptor-accent ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // ── Import / Export handlers ───────────────────────────────────────────────

  const handleExport = (format) => {
    setTransferMenuOpen(false)
    window.location.href = `/api/mods/export/${format}?vehicle_id=${selectedVehicleId}`
  }

  const handleImportClick = () => {
    setTransferMenuOpen(false)
    setImportResult(null)
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
      const res = await fetch(`/api/mods/import?vehicle_id=${selectedVehicleId}`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setImportResult({ error: data.error || 'Import failed' })
      } else {
        setImportResult(data)
        fetchMods()
      }
    } catch {
      setImportResult({ error: 'Import failed — check your connection' })
    } finally {
      setImporting(false)
    }
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
      {/* Hidden import file input */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json,.zip"
        className="hidden"
        onChange={handleImportFile}
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="page-title">Modifications</h1>
        <div className="flex items-center gap-2">
          {/* Import / Export dropdown */}
          <div className="relative" ref={transferMenuRef}>
            <button
              onClick={() => setTransferMenuOpen(o => !o)}
              disabled={importing}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              {importing ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              )}
              {importing ? 'Importing…' : 'Import / Export'}
              {!importing && (
                <svg className="w-3 h-3 text-raptor-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {transferMenuOpen && (
              <div className="absolute right-0 mt-1 w-52 bg-raptor-card border border-raptor-border rounded-lg shadow-lg z-20 py-1 text-sm">
                <div className="px-3 py-1.5 text-xs font-semibold text-raptor-muted uppercase tracking-wide">Export</div>
                <button
                  onClick={() => handleExport('json')}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-raptor-primary hover:bg-raptor-elevated transition-colors"
                >
                  <svg className="w-4 h-4 text-raptor-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export as JSON
                  <span className="ml-auto text-xs text-raptor-muted">data only</span>
                </button>
                <button
                  onClick={() => handleExport('zip')}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-raptor-primary hover:bg-raptor-elevated transition-colors"
                >
                  <svg className="w-4 h-4 text-raptor-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export as ZIP
                  <span className="ml-auto text-xs text-raptor-muted">+ photos</span>
                </button>
                <div className="border-t border-raptor-border my-1" />
                <div className="px-3 py-1.5 text-xs font-semibold text-raptor-muted uppercase tracking-wide">Import</div>
                <button
                  onClick={handleImportClick}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-raptor-primary hover:bg-raptor-elevated transition-colors"
                >
                  <svg className="w-4 h-4 text-raptor-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4 0l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  Import JSON or ZIP
                </button>
              </div>
            )}
          </div>

          <Link to="/mods/new" className="btn-primary text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Mod
          </Link>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm ${
          importResult.error
            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
            : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
        }`}>
          <span>
            {importResult.error
              ? `Import failed: ${importResult.error}`
              : `Imported ${importResult.imported} mod${importResult.imported !== 1 ? 's' : ''} successfully${importResult.skipped > 0 ? ` (${importResult.skipped} skipped — missing part name)` : ''}.`
            }
          </span>
          <button onClick={() => setImportResult(null)} className="flex-shrink-0 opacity-60 hover:opacity-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-raptor-elevated border border-raptor-border rounded-lg p-1 w-fit">
        {VIEWS.map(v => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === v.id
                ? 'bg-raptor-card text-raptor-primary shadow-sm border border-raptor-border'
                : 'text-raptor-secondary hover:text-raptor-primary'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Filters — only shown in list view */}
      {view === 'list' && (
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search part, brand, vendor…"
            className="input-field max-w-xs text-sm"
          />
          <select value={category} onChange={e => setCategory(e.target.value)} className="input-field w-auto text-sm">
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="input-field w-auto text-sm">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          {(category || status || search) && (
            <button
              onClick={() => { setCategory(''); setStatus(''); setSearch('') }}
              className="btn-secondary text-sm"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-raptor-muted animate-pulse">Loading…</div>
      ) : (
        <>
          {view === 'buildsheet' && <BuildSheet mods={allMods} />}
          {view === 'timeline' && <BuildTimeline mods={allMods} />}

          {view === 'list' && (
            sorted.length === 0 ? (
              <div className="card p-10 text-center">
                <p className="text-raptor-secondary mb-4">
                  {allMods.length === 0 ? 'No mods yet.' : 'No mods match your filters.'}
                </p>
                {allMods.length === 0 && (
                  <Link to="/mods/new" className="btn-primary text-sm">Add Your First Mod</Link>
                )}
              </div>
            ) : (
              <>
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-raptor-border text-left bg-raptor-elevated">
                          <th className="px-4 py-3 text-raptor-secondary font-medium cursor-pointer hover:text-raptor-primary" onClick={() => toggleSort('part_name')}>
                            Part <SortIcon field="part_name" />
                          </th>
                          <th className="px-4 py-3 text-raptor-secondary font-medium cursor-pointer hover:text-raptor-primary hidden sm:table-cell" onClick={() => toggleSort('category')}>
                            Category <SortIcon field="category" />
                          </th>
                          <th className="px-4 py-3 text-raptor-secondary font-medium cursor-pointer hover:text-raptor-primary" onClick={() => toggleSort('status')}>
                            Status <SortIcon field="status" />
                          </th>
                          <th className="px-4 py-3 text-raptor-secondary font-medium cursor-pointer hover:text-raptor-primary hidden md:table-cell" onClick={() => toggleSort('cost')}>
                            Cost <SortIcon field="cost" />
                          </th>
                          <th className="px-4 py-3 text-raptor-secondary font-medium cursor-pointer hover:text-raptor-primary hidden lg:table-cell" onClick={() => toggleSort('install_date')}>
                            Installed <SortIcon field="install_date" />
                          </th>
                          <th className="px-4 py-3 text-raptor-secondary font-medium hidden lg:table-cell">
                            Mileage
                          </th>
                          <th className="px-4 py-3 w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map(mod => {
                          const photos = JSON.parse(mod.photos || '[]')
                          return (
                            <tr
                              key={mod.id}
                              className="border-b border-raptor-border hover:bg-raptor-elevated transition-colors cursor-pointer"
                              onClick={() => setDetailModId(mod.id)}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  {photos[0] && (
                                    <img
                                      src={photos[0]}
                                      alt=""
                                      className="w-9 h-9 rounded-md object-cover flex-shrink-0 border border-raptor-border"
                                    />
                                  )}
                                  <div>
                                    <div className="font-medium text-raptor-primary">{mod.part_name}</div>
                                    {mod.brand && <div className="text-xs text-raptor-muted mt-0.5">{mod.brand}</div>}
                                    {mod.aux_switch && <div className="text-xs text-raptor-accent mt-0.5">AUX {mod.aux_switch}</div>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-raptor-secondary hidden sm:table-cell">
                                {mod.category?.replace('_', ' ')}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge status={mod.status} />
                              </td>
                              <td className="px-4 py-3 text-raptor-secondary hidden md:table-cell tabular-nums">
                                {mod.cost != null ? `$${parseFloat(mod.cost).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                              </td>
                              <td className="px-4 py-3 text-raptor-muted text-xs hidden lg:table-cell">
                                {mod.install_date ? new Date(mod.install_date + 'T12:00:00').toLocaleDateString() : '—'}
                              </td>
                              <td className="px-4 py-3 text-raptor-muted text-xs hidden lg:table-cell tabular-nums">
                                {mod.mileage_at_install != null ? mod.mileage_at_install.toLocaleString() + ' mi' : '—'}
                              </td>
                              <td className="px-4 py-3 text-raptor-muted" onClick={e => e.stopPropagation()}>
                                <Link
                                  to={`/mods/${mod.id}`}
                                  className="p-1.5 rounded hover:bg-raptor-border hover:text-raptor-primary transition-colors inline-block"
                                  title="Edit"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-raptor-secondary px-1">
                  <span>{sorted.length} mod{sorted.length !== 1 ? 's' : ''} shown</span>
                  {totalCost > 0 && (
                    <span>Total: <span className="text-raptor-primary font-semibold tabular-nums">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></span>
                  )}
                  {installedCost > 0 && status !== 'Installed' && (
                    <span>Installed: <span className="text-raptor-accent font-semibold tabular-nums">${installedCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></span>
                  )}
                </div>
              </>
            )
          )}
        </>
      )}

      {detailModId && (
        <ModDetailPanel
          modId={detailModId}
          onClose={() => setDetailModId(null)}
        />
      )}
    </div>
  )
}
