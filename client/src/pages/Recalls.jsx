import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { setRecallState, logRecallAsService } from '../lib/recalls'

const NHTSA_LOOKUP = 'https://www.nhtsa.gov/recalls'

const fmtDate = (d) => {
  if (!d) return null
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? null : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function RecallCard({ recall, onState, onLogRepair, busy }) {
  const [open, setOpen] = useState(false)
  const reported = fmtDate(recall.reportDate)
  const tone = recall.state === 'applies'
    ? 'border-l-4 border-l-red-500'
    : recall.state === 'review' ? 'border-l-4 border-l-yellow-500' : ''

  return (
    <div className={`card p-4 ${tone}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-raptor-primary">{recall.title}</div>
          <div className="text-xs text-raptor-muted mt-0.5">
            {[recall.area, `NHTSA ${recall.campaign}`, reported && `reported ${reported}`].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {recall.summary && (
        <p className={`text-sm text-raptor-secondary mt-2 ${open ? '' : 'line-clamp-2'}`}>{recall.summary}</p>
      )}
      {open && (
        <div className="mt-2 space-y-2 text-sm">
          {recall.consequence && (
            <p><span className="font-medium text-raptor-primary">Risk: </span><span className="text-raptor-secondary">{recall.consequence}</span></p>
          )}
          {recall.remedy && (
            <p><span className="font-medium text-raptor-primary">Remedy: </span><span className="text-raptor-secondary">{recall.remedy}</span></p>
          )}
        </div>
      )}
      {(recall.summary || recall.remedy) && (
        <button type="button" onClick={() => setOpen(v => !v)} className="text-xs text-raptor-accent hover:underline mt-1">
          {open ? 'Show less' : 'Read the full recall'}
        </button>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {recall.state === 'review' && (
          <>
            <button type="button" disabled={busy} onClick={() => onState(recall, 'applies')} className="btn-primary text-xs px-3 py-1.5">
              Affects my truck
            </button>
            <button type="button" disabled={busy} onClick={() => onState(recall, 'not_applicable')} className="btn-secondary text-xs px-3 py-1.5">
              Doesn&apos;t apply
            </button>
          </>
        )}
        {recall.state === 'applies' && (
          <>
            <button type="button" disabled={busy} onClick={() => onLogRepair(recall)} className="btn-primary text-xs px-3 py-1.5">
              Log the repair
            </button>
            <button type="button" disabled={busy} onClick={() => onState(recall, 'fixed')} className="btn-secondary text-xs px-3 py-1.5">
              Mark repaired
            </button>
          </>
        )}
        {recall.state !== 'review' && (
          <button type="button" disabled={busy} onClick={() => onState(recall, 'review')} className="text-xs text-raptor-muted hover:text-raptor-primary px-1">
            Undo
          </button>
        )}
      </div>
    </div>
  )
}

export default function Recalls() {
  const { selectedVehicleId } = useApp()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const load = useCallback(() => {
    if (!selectedVehicleId) return
    setLoading(true)
    fetch(`/api/recalls?vehicle_id=${selectedVehicleId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [selectedVehicleId])

  useEffect(() => { load() }, [load])

  const onState = async (recall, state) => {
    setBusy(true)
    // Optimistic: move the card now, reconcile with the server after.
    setData(d => d && ({ ...d, recalls: d.recalls.map(r => (r.campaign === recall.campaign ? { ...r, state } : r)) }))
    await setRecallState(selectedVehicleId, recall.campaign, state)
    setBusy(false)
    load()
  }

  const onLogRepair = async (recall) => {
    setBusy(true)
    const ok = await logRecallAsService(selectedVehicleId, recall)
    setBusy(false)
    if (ok) navigate('/maintenance')
  }

  const copyVin = async () => {
    try {
      await navigator.clipboard.writeText(data.vin)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_) { /* clipboard blocked — the VIN is shown and selectable */ }
  }

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  const recalls = data?.recalls || []
  const groups = {
    applies: recalls.filter(r => r.state === 'applies'),
    review: recalls.filter(r => r.state === 'review'),
    fixed: recalls.filter(r => r.state === 'fixed'),
    not_applicable: recalls.filter(r => r.state === 'not_applicable'),
  }
  const doneCount = groups.fixed.length + groups.not_applicable.length

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="page-title">Recalls</h1>
        {data && (
          <p className="text-raptor-secondary text-sm mt-0.5">
            NHTSA campaigns for {data.year} {data.make} {data.model}
          </p>
        )}
      </div>

      <div className="card p-4 space-y-3">
        <p className="text-sm text-raptor-secondary">
          NHTSA lists recalls by make, model, and year. A campaign usually covers specific build dates,
          engines, or trims, so not every one below applies to your truck. Check your VIN, then mark each one.
          Only the ones you confirm count as urgent.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {data?.vin ? (
            <>
              <code className="text-sm font-mono px-2 py-1 rounded bg-raptor-elevated border border-raptor-border select-all">{data.vin}</code>
              <button type="button" onClick={copyVin} className="btn-secondary text-xs px-3 py-1.5">
                {copied ? 'Copied' : 'Copy VIN'}
              </button>
            </>
          ) : (
            <span className="text-sm text-raptor-muted">
              No VIN on file. <Link to="/garage" className="text-raptor-accent hover:underline">Add it in My Garage</Link> to check quickly.
            </span>
          )}
          <a href={NHTSA_LOOKUP} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs px-3 py-1.5">
            Check on NHTSA ↗
          </a>
        </div>
        <p className="text-xs text-raptor-muted">
          NHTSA doesn&apos;t offer a public VIN lookup that RaptorTracker could call for you, so paste it on their site.
        </p>
      </div>

      {loading && !data && <div className="text-raptor-muted animate-pulse text-sm">Checking NHTSA…</div>}
      {data?.error && (
        <div className="card p-4 text-sm">
          <p className="text-raptor-primary">Couldn&apos;t reach NHTSA just now.</p>
          <p className="text-raptor-muted text-xs mt-1">{data.error}</p>
          <button type="button" onClick={load} className="btn-secondary text-xs px-3 py-1.5 mt-2">Try again</button>
        </div>
      )}
      {data && !data.error && recalls.length === 0 && (
        <div className="card p-6 text-center text-sm text-raptor-secondary">
          NHTSA lists no recalls for {data.year} {data.model}s.
        </div>
      )}

      {groups.applies.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">Affects my truck ({groups.applies.length})</h2>
          {groups.applies.map(r => <RecallCard key={r.campaign} recall={r} onState={onState} onLogRepair={onLogRepair} busy={busy} />)}
        </section>
      )}

      {groups.review.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">May apply — check your VIN ({groups.review.length})</h2>
          {groups.review.map(r => <RecallCard key={r.campaign} recall={r} onState={onState} onLogRepair={onLogRepair} busy={busy} />)}
        </section>
      )}

      {doneCount > 0 && (
        <section className="space-y-2">
          <button type="button" onClick={() => setShowDone(v => !v)} className="section-title hover:text-raptor-primary">
            {showDone ? '▾' : '▸'} Repaired or not applicable ({doneCount})
          </button>
          {showDone && [...groups.fixed, ...groups.not_applicable].map(r => (
            <RecallCard key={r.campaign} recall={r} onState={onState} onLogRepair={onLogRepair} busy={busy} />
          ))}
        </section>
      )}
    </div>
  )
}
