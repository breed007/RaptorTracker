import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge'
import Lightbox from './Lightbox'

function InfoRow({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div>
      <div className="text-xs text-raptor-muted mb-0.5">{label}</div>
      <div className="text-sm text-raptor-primary font-medium">{value}</div>
    </div>
  )
}

export default function ModDetailPanel({ modId, onClose }) {
  const [mod, setMod] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)

  useEffect(() => {
    if (!modId) { setMod(null); return }
    fetch(`/api/mods/${modId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setMod)
  }, [modId])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && lightboxIndex === null) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, lightboxIndex])

  if (!modId) return null

  const photos = mod?.photos || []

  const fmt = {
    date: s => s ? new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
    currency: n => n != null ? `$${parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : null,
    miles: n => n != null ? `${n.toLocaleString()} mi` : null,
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Slide-out panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-raptor-card border-l border-raptor-border shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-raptor-border flex-shrink-0">
          <div className="min-w-0 flex-1">
            {mod ? (
              <>
                <div className="font-display font-bold text-raptor-primary text-lg leading-tight truncate">
                  {mod.part_name}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <StatusBadge status={mod.status} />
                  {mod.category && (
                    <span className="text-xs text-raptor-muted">{mod.category.replace(/_/g, ' ')}</span>
                  )}
                  {mod.aux_switch && (
                    <span className="text-xs text-raptor-accent font-medium">AUX {mod.aux_switch}</span>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <div className="h-5 w-48 bg-raptor-elevated rounded animate-pulse" />
                <div className="h-3.5 w-24 bg-raptor-elevated rounded animate-pulse" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {mod && (
              <Link
                to={`/mods/${modId}`}
                onClick={onClose}
                className="btn-secondary text-xs flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </Link>
            )}
            <button
              onClick={onClose}
              className="text-raptor-muted hover:text-raptor-primary p-1.5 rounded-lg hover:bg-raptor-elevated transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!mod ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-4 bg-raptor-elevated rounded animate-pulse" style={{ width: `${60 + i * 7}%` }} />
              ))}
            </div>
          ) : (
            <>
              {/* Part details grid */}
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                <InfoRow label="Brand" value={mod.brand} />
                <InfoRow label="Part Number" value={mod.part_number} />
                <InfoRow
                  label="Vendor"
                  value={mod.vendor
                    ? mod.vendor_url
                      ? <a href={mod.vendor_url} target="_blank" rel="noopener noreferrer" className="text-raptor-accent hover:underline">{mod.vendor} ↗</a>
                      : mod.vendor
                    : null}
                />
                <InfoRow label="Cost" value={fmt.currency(mod.cost)} />
                <InfoRow label="Purchased" value={fmt.date(mod.purchase_date)} />
                <InfoRow label="Installed" value={fmt.date(mod.install_date)} />
                <InfoRow label="Mileage at Install" value={fmt.miles(mod.mileage_at_install)} />
                {mod.aux_switch && (
                  <InfoRow
                    label="AUX Assignment"
                    value={`AUX ${mod.aux_switch}${mod.aux_label ? ' — ' + mod.aux_label : ''}`}
                  />
                )}
              </div>

              {/* Install notes */}
              {mod.install_notes && (
                <div className="pt-3 border-t border-raptor-border">
                  <div className="text-xs font-semibold text-raptor-muted uppercase tracking-wide mb-2">Install Notes</div>
                  <p className="text-sm text-raptor-secondary whitespace-pre-wrap leading-relaxed">{mod.install_notes}</p>
                </div>
              )}

              {/* Wiring notes */}
              {mod.wiring_notes && (
                <div className="pt-3 border-t border-raptor-border">
                  <div className="text-xs font-semibold text-raptor-muted uppercase tracking-wide mb-2">Wiring Notes</div>
                  <pre className="text-xs text-raptor-secondary whitespace-pre-wrap leading-relaxed font-mono bg-raptor-elevated rounded-lg p-3 border border-raptor-border overflow-x-auto">
                    {mod.wiring_notes}
                  </pre>
                </div>
              )}

              {/* Photos */}
              {photos.length > 0 && (
                <div className="pt-3 border-t border-raptor-border">
                  <div className="text-xs font-semibold text-raptor-muted uppercase tracking-wide mb-2">
                    Photos ({photos.length})
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => setLightboxIndex(i)}
                        className="aspect-square rounded-lg overflow-hidden bg-raptor-elevated border border-raptor-border hover:border-raptor-accent transition-colors group focus:outline-none focus:ring-2 focus:ring-raptor-accent"
                        aria-label={`View photo ${i + 1}`}
                      >
                        <img
                          src={src}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
