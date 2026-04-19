import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const CheckIcon = () => (
  <svg className="w-4 h-4 text-raptor-accent flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
)

export default function Export() {
  const { selectedVehicleId, selectedVehicle } = useApp()
  const [summary, setSummary] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [includeSticker, setIncludeSticker] = useState(false)

  useEffect(() => {
    if (!selectedVehicleId) return
    fetch(`/api/summary?vehicle_id=${selectedVehicleId}`)
      .then(r => r.json())
      .then(setSummary)
  }, [selectedVehicleId])

  const handleExport = async () => {
    if (!selectedVehicleId) return
    setGenerating(true)
    try {
      const params = includeSticker ? '?include_sticker=true' : ''
      const res = await fetch(`/api/export/pdf/${selectedVehicleId}${params}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const nickname = selectedVehicle?.nickname?.replace(/[^a-z0-9]/gi, '-') || 'Raptor'
      const date = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `RaptorTracker-${nickname}-${date}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('PDF export failed — check server logs')
    } finally {
      setGenerating(false)
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

  const stats = summary?.stats || {}
  const installed = stats.installed || 0
  const totalSpend = stats.total_spend || 0

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">Export Build Sheet</h1>
        <p className="text-raptor-secondary text-sm mt-1">
          Generate a PDF build documentation for {selectedVehicle?.nickname || 'your vehicle'}.
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="section-title">PDF Contents</div>
        <ul className="space-y-2 text-sm text-raptor-secondary">
          {[
            'Vehicle info header (year, model, generation, color, VIN, options)',
            'Installed mods grouped by category with costs and dates',
            'Photo thumbnails (max 3 per row, 6 per mod)',
            'AUX switch map with assigned labels and factory notes',
            'Complete maintenance history',
            'Total investment summary',
          ].map(item => (
            <li key={item} className="flex items-center gap-2">
              <CheckIcon />
              {item}
            </li>
          ))}
          {includeSticker && selectedVehicle?.window_sticker && (
            <li className="flex items-center gap-2">
              <CheckIcon />
              Window sticker (final page)
            </li>
          )}
        </ul>

        {selectedVehicle?.window_sticker && (
          <label className="flex items-center gap-3 pt-2 border-t border-raptor-border cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeSticker}
              onChange={e => setIncludeSticker(e.target.checked)}
              className="w-4 h-4 accent-raptor-accent"
            />
            <span className="text-sm text-raptor-secondary">Include window sticker as final page</span>
          </label>
        )}
      </div>

      <div className="card p-5 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-raptor-muted uppercase tracking-wide">Installed Mods</div>
          <div className="text-2xl font-display font-bold text-raptor-accent mt-0.5">{installed}</div>
        </div>
        <div>
          <div className="text-xs text-raptor-muted uppercase tracking-wide">Total Spend</div>
          <div className="text-2xl font-display font-bold text-raptor-primary mt-0.5">
            ${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      <button
        onClick={handleExport}
        disabled={generating}
        className="btn-primary w-full flex items-center justify-center gap-3 py-3 text-base disabled:opacity-50"
      >
        {generating ? (
          <>
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating PDF…
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Build Sheet PDF
          </>
        )}
      </button>

      <p className="text-xs text-raptor-muted text-center">
        File: RaptorTracker-{(selectedVehicle?.nickname || 'Raptor').replace(/[^a-z0-9]/gi, '-')}-{new Date().toISOString().slice(0, 10)}.pdf
      </p>
    </div>
  )
}
