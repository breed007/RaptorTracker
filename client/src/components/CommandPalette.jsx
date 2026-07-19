import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

// Pages reachable by name, so the palette doubles as a nav jump-list
const PAGES = [
  { title: 'Dashboard', link: '/' },
  { title: 'My Garage', link: '/garage' },
  { title: 'Modifications', link: '/mods' },
  { title: 'Add a Mod', link: '/mods/new' },
  { title: 'AUX Panel', link: '/aux' },
  { title: 'Maintenance', link: '/maintenance' },
  { title: 'Tire Sets', link: '/tires' },
  { title: 'Wishlist', link: '/wishlist' },
  { title: 'Fuel Log', link: '/fuel' },
  { title: 'Warranty', link: '/warranty' },
  { title: 'Cost of Ownership', link: '/tco' },
  { title: 'Analytics', link: '/analytics' },
  { title: 'Logbook', link: '/logbook' },
  { title: 'Notifications', link: '/notifications' },
  { title: 'Reference', link: '/vehicles' },
  { title: 'Export & Backup', link: '/export' },
  { title: 'Quick Add', link: '/quick' },
]

export default function CommandPalette({ open, onClose }) {
  const { selectedVehicleId } = useApp()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  // Reset and focus whenever it opens
  useEffect(() => {
    if (open) {
      setQ(''); setResults([]); setActive(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  // Debounced record search; page matches are computed locally
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    if (term.length < 2 || !selectedVehicleId) { setResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/search?vehicle_id=${selectedVehicleId}&q=${encodeURIComponent(term)}`)
        .then(r => r.ok ? r.json() : { results: [] })
        .then(d => setResults(Array.isArray(d.results) ? d.results : []))
        .catch(() => setResults([]))
    }, 180)
    return () => clearTimeout(t)
  }, [q, open, selectedVehicleId])

  const term = q.trim().toLowerCase()
  const pageMatches = term
    ? PAGES.filter(p => p.title.toLowerCase().includes(term)).map(p => ({ type: 'Go to', title: p.title, link: p.link }))
    : PAGES.slice(0, 8).map(p => ({ type: 'Go to', title: p.title, link: p.link }))

  const items = [...pageMatches, ...results]

  const go = (item) => { if (!item) return; onClose(); navigate(item.link) }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  useEffect(() => { setActive(0) }, [q])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[12vh] px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl bg-raptor-card border border-raptor-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-raptor-border">
          <svg className="w-4 h-4 text-raptor-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search mods, service, parts — or jump to a page…"
            className="flex-1 bg-transparent outline-none text-raptor-primary placeholder:text-raptor-muted text-sm"
          />
          <kbd className="text-xs text-raptor-muted border border-raptor-border rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-raptor-secondary text-center">
              {term.length < 2 ? 'Type at least two characters to search your records.' : 'No matches.'}
            </div>
          ) : (
            items.map((item, i) => (
              <button
                key={`${item.type}-${item.link}-${i}`}
                onClick={() => go(item)}
                onMouseEnter={() => setActive(i)}
                className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${
                  i === active ? 'bg-raptor-elevated' : ''
                }`}
              >
                <span className="text-xs font-medium text-raptor-muted w-16 flex-shrink-0">{item.type}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-raptor-primary truncate">{item.title}</span>
                  {item.subtitle && <span className="block text-xs text-raptor-muted truncate">{item.subtitle}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
