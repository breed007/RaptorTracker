import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { localDate } from '../lib/dates'
import { toast } from '../lib/toast'

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

function Option({ id, checked, onChange, label, hint }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer select-none">
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 mt-0.5 accent-raptor-accent" />
      <span>
        <span className="text-sm text-raptor-primary">{label}</span>
        {hint && <span className="block text-xs text-raptor-muted">{hint}</span>}
      </span>
    </label>
  )
}

async function download(url, filename, setBusy) {
  setBusy(true)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error()
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href; a.download = filename; a.click()
    URL.revokeObjectURL(href)
  } catch {
    toast('The PDF could not be made. The server log has the details.', { tone: 'error' })
  } finally { setBusy(false) }
}

export default function Reports() {
  const { selectedVehicleId, selectedVehicle } = useApp()
  const [sticker, setSticker] = useState(false)
  const [buildBusy, setBuildBusy] = useState(false)
  const [hist, setHist] = useState({ costs: false, mods: true, trail: false, receipts: false, vin: true })
  const [histBusy, setHistBusy] = useState(false)

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  const slug = (selectedVehicle?.nickname || 'Raptor').replace(/[^a-z0-9]/gi, '-')
  const setH = (k) => (v) => setHist(h => ({ ...h, [k]: v }))
  const histQuery = new URLSearchParams(Object.fromEntries(Object.entries(hist).map(([k, v]) => [k, String(v)]))).toString()

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="text-raptor-secondary text-sm mt-0.5">Printable PDFs for {selectedVehicle?.nickname || 'your vehicle'}.</p>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <div className="section-title">Vehicle History for a Sale</div>
          <p className="text-sm text-raptor-secondary mt-1">
            What a buyer wants to see: every service with dates and odometer readings, the maintenance schedule and
            what&apos;s due, repaired recalls, warranties, tires, and whether the odometer readings line up. It says
            plainly that the records are yours, not a dealer&apos;s.
          </p>
        </div>
        <div className="space-y-2.5">
          <Option id="hist-vin" checked={hist.vin} onChange={setH('vin')} label="Show the VIN" hint="Buyers need it for a history check. Leave it off for a public listing." />
          <Option id="hist-costs" checked={hist.costs} onChange={setH('costs')} label="Show what was paid" hint="Service and parts costs. Off by default." />
          <Option id="hist-mods" checked={hist.mods} onChange={setH('mods')} label="List modifications" />
          <Option id="hist-trail" checked={hist.trail} onChange={setH('trail')} label="Include trail days" hint="Off-road trips and any damage you noted. Some buyers will ask." />
          <Option id="hist-receipts" checked={hist.receipts} onChange={setH('receipts')} label="Attach receipt photos" hint="Images attached to service records, on pages at the end." />
        </div>
        <button
          type="button" disabled={histBusy}
          onClick={() => download(`/api/export/history/${selectedVehicleId}?${histQuery}`, `RaptorTracker-${slug}-history-${localDate()}.pdf`, setHistBusy)}
          className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <DownloadIcon /> {histBusy ? 'Making the PDF…' : 'Download vehicle history'}
        </button>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <div className="section-title">Build Sheet</div>
          <p className="text-sm text-raptor-secondary mt-1">
            The build itself: installed mods by category with photos and costs, the AUX switch map, and the service history.
          </p>
        </div>
        {selectedVehicle?.window_sticker && (
          <Option id="build-sticker" checked={sticker} onChange={setSticker} label="Add the window sticker as the last page" />
        )}
        <button
          type="button" disabled={buildBusy}
          onClick={() => download(`/api/export/pdf/${selectedVehicleId}${sticker ? '?include_sticker=true' : ''}`, `RaptorTracker-${slug}-build-sheet-${localDate()}.pdf`, setBuildBusy)}
          className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <DownloadIcon /> {buildBusy ? 'Making the PDF…' : 'Download build sheet'}
        </button>
      </div>

      <p className="text-xs text-raptor-muted">
        Spreadsheet exports of every record are under <Link to="/settings/data" className="text-raptor-accent hover:underline">Settings → Import &amp; Export</Link>.
      </p>
    </div>
  )
}
