import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const FORMATS = [
  { id: 'bbcode',   label: 'Forum (BBCode)', hint: 'FordRaptorForum, most vBulletin/XenForo boards' },
  { id: 'markdown', label: 'Markdown',       hint: 'Reddit, GitHub, Discord' },
  { id: 'text',     label: 'Plain Text',     hint: 'Signatures, anywhere else' },
]

const TOGGLES = [
  { key: 'aux',          label: 'AUX switch assignments', hint: 'Which switch runs what' },
  { key: 'part_numbers', label: 'Part numbers',           hint: 'Helps people order the same parts' },
  { key: 'links',        label: 'Vendor links',           hint: 'Links each part to where you bought it' },
  { key: 'mileage',      label: 'Current mileage' },
  { key: 'costs',        label: 'Prices',                 hint: 'Off by default — a build list is public, what you spent usually is not' },
  { key: 'attribution',  label: 'RaptorTracker credit line' },
]

export default function ShareBuild() {
  const { selectedVehicleId } = useApp()
  const [format, setFormat] = useState('bbcode')
  const [opts, setOpts] = useState({
    aux: true, part_numbers: false, links: false,
    mileage: true, costs: false, attribution: true,
  })
  const [sheet, setSheet] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    if (!selectedVehicleId) return
    setLoading(true)
    const q = new URLSearchParams({
      vehicle_id: selectedVehicleId, format,
      ...Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, String(v)])),
    })
    fetch(`/api/share/build-sheet?${q}`)
      .then(r => r.ok ? r.json() : null)
      .then(setSheet)
      .catch(() => setSheet(null))
      .finally(() => setLoading(false))
  }, [selectedVehicleId, format, opts])

  useEffect(() => { load() }, [load])
  useEffect(() => { setCopied(false) }, [sheet])

  const copy = async () => {
    if (!sheet?.content) return
    try {
      await navigator.clipboard.writeText(sheet.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (_) { /* clipboard blocked — the textarea below is selectable */ }
  }

  const download = () => {
    if (!sheet?.content) return
    const ext = format === 'markdown' ? 'md' : 'txt'
    const url = URL.createObjectURL(new Blob([sheet.content], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url; a.download = `build-sheet.${ext}`; a.click()
    URL.revokeObjectURL(url)
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
      <div>
        <h1 className="page-title">Share Your Build</h1>
        <p className="text-raptor-secondary text-sm mt-0.5">
          Your installed mods, formatted to paste straight into a forum post or signature.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-4">
          <div className="card p-4">
            <div className="section-title mb-3">Format</div>
            <div className="space-y-2">
              {FORMATS.map(f => (
                <label key={f.id} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio" name="format" checked={format === f.id}
                    onChange={() => setFormat(f.id)} className="mt-1 accent-raptor-accent"
                  />
                  <span>
                    <span className="block text-sm text-raptor-primary">{f.label}</span>
                    <span className="block text-xs text-raptor-muted">{f.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <div className="section-title mb-3">Include</div>
            <div className="space-y-2.5">
              {TOGGLES.map(t => (
                <label key={t.key} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox" checked={opts[t.key]}
                    onChange={e => setOpts(o => ({ ...o, [t.key]: e.target.checked }))}
                    className="mt-1 accent-raptor-accent"
                  />
                  <span>
                    <span className="block text-sm text-raptor-primary">{t.label}</span>
                    {t.hint && <span className="block text-xs text-raptor-muted">{t.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <p className="text-xs text-raptor-muted px-1">
            Only mods marked <span className="text-raptor-secondary">Installed</span> appear.
            Your VIN, purchase price, and insurance details are never included.
          </p>
        </div>

        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-raptor-secondary">
              {loading ? 'Building…' : sheet ? `${sheet.modCount} installed ${sheet.modCount === 1 ? 'mod' : 'mods'}` : ''}
            </div>
            <div className="flex gap-2">
              <button onClick={copy} disabled={!sheet?.content} className="btn-primary text-sm">
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button onClick={download} disabled={!sheet?.content} className="btn-secondary text-sm">
                Download
              </button>
            </div>
          </div>

          {sheet && sheet.modCount === 0 ? (
            <div className="card p-10 text-center space-y-3">
              <p className="text-raptor-secondary">Nothing to share yet.</p>
              <p className="text-sm text-raptor-muted">
                A build sheet lists mods marked <span className="text-raptor-secondary">Installed</span>.
                Anything still ordered or in transit is left out.
              </p>
              <Link to="/mods" className="btn-primary text-sm inline-block">Go to Modifications</Link>
            </div>
          ) : (
            <textarea
              readOnly
              value={sheet?.content || ''}
              onFocus={e => e.target.select()}
              spellCheck={false}
              className="w-full h-[28rem] font-mono text-xs bg-raptor-elevated border border-raptor-border rounded-lg p-3 text-raptor-primary resize-y"
            />
          )}
        </div>
      </div>
    </div>
  )
}
