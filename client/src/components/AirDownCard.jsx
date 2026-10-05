import React, { useEffect, useState } from 'react'
import { currentUnits } from '../lib/units'

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : 'Unspecified terrain')

/**
 * What to air down to with this tire set, from the owner's own outings, and
 * the street pressure to air back up to. Prints as a small card for the glovebox.
 */
export default function AirDownCard({ setId, onClose }) {
  const [data, setData] = useState(null)
  const u = currentUnits()

  useEffect(() => {
    fetch(`/api/tires/${setId}/air-down`).then(r => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null))
  }, [setId])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const print = () => {
    document.body.classList.add('print-card-only')
    const done = () => { document.body.classList.remove('print-card-only'); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    window.print()
  }

  const pair = (f, r) => (f == null && r == null ? '—' : `${u.pressureNum(f)} / ${u.pressureNum(r)}`)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="airdown-title">
      <div className="absolute inset-0 bg-black/60 no-print" onClick={onClose} />
      <div className="relative card w-full max-w-md p-0 overflow-hidden">
        {!data ? (
          <div className="p-6 text-sm text-raptor-muted animate-pulse">Loading…</div>
        ) : (
          <>
            <div className="print-card p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-raptor-accent">Air-down card</div>
                <h2 id="airdown-title" className="text-lg font-bold text-raptor-primary">{data.set.name}</h2>
                <div className="text-xs text-raptor-muted">
                  {[data.set.tire_brand, data.set.tire_model, data.set.tire_size, data.set.wheel_size && `on ${data.set.wheel_size}`].filter(Boolean).join(' ')}
                </div>
              </div>

              <div className="rounded-lg border border-raptor-border p-3">
                <div className="text-xs text-raptor-muted">Street pressure, front / rear ({u.pressure})</div>
                <div className="text-2xl font-bold text-raptor-primary tabular-nums">{pair(data.street.front, data.street.rear)}</div>
                {data.street.front == null && data.street.rear == null && (
                  <div className="text-xs text-raptor-muted mt-1 no-print">Add it from the door-jamb sticker by editing the set.</div>
                )}
              </div>

              {data.byTerrain.length === 0 ? (
                <p className="text-sm text-raptor-secondary">
                  No trail pressures logged with this set yet. Log an outing with this tire set and the pressures you ran,
                  and they&apos;ll show up here by terrain.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-raptor-muted text-left">
                      <th className="font-medium pb-1">Terrain</th>
                      <th className="font-medium pb-1 text-right">You ran ({u.pressure})</th>
                      <th className="font-medium pb-1 text-right">Trips</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byTerrain.map(t => (
                      <tr key={t.terrain || 'none'} className="border-t border-raptor-border">
                        <td className="py-1.5 text-raptor-primary">{cap(t.terrain)}</td>
                        <td className="py-1.5 text-right font-semibold text-raptor-primary tabular-nums">{pair(t.front, t.rear)}</td>
                        <td className="py-1.5 text-right text-raptor-muted tabular-nums">{t.trips}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <p className="text-xs text-raptor-muted">
                Pressures are the middle value of your logged trips, front / rear. Air back up to street pressure before
                highway speeds.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-raptor-border no-print">
              <button type="button" onClick={print} className="btn-secondary text-sm">Print</button>
              <button type="button" onClick={onClose} className="btn-primary text-sm">Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
