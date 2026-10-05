import React, { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Nav from './Nav'
import CommandPalette from './CommandPalette'
import Toaster from './Toaster'

// The browser tab title, and what a screen reader announces, per page.
const TITLES = [
  ['/settings/backups', 'Backups'], ['/settings/data', 'Import & Export'], ['/settings/notifications', 'Notifications'],
  ['/settings/account', 'Account'], ['/settings/trash', 'Trash'], ['/settings', 'Settings'],
  ['/mods/new', 'New Mod'], ['/mods/', 'Mod'], ['/mods', 'Modifications'], ['/garage', 'My Garage'], ['/vehicles', 'Reference'],
  ['/aux', 'AUX Panel'], ['/share', 'Share Build'], ['/maintenance', 'Maintenance'], ['/recalls', 'Recalls'],
  ['/wishlist', 'Wishlist'], ['/fuel', 'Fuel Log'], ['/tires', 'Tire Sets'], ['/outings', 'Trail Log'],
  ['/warranty', 'Warranty'], ['/tco', 'Cost of Ownership'], ['/quick', 'Quick Add'], ['/logbook', 'Logbook'],
  ['/analytics', 'Analytics'], ['/reports', 'Reports'],
]
const titleFor = (path) => (path === '/' ? 'Dashboard' : (TITLES.find(([p]) => path.startsWith(p)) || [, 'RaptorTracker'])[1])

export default function Layout({ children }) {
  const [navOpen, setNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // ⌘K / Ctrl+K opens search from anywhere
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const location = useLocation()
  const mainRef = useRef(null)
  const firstRender = useRef(true)

  // A route change in a single-page app is silent to a screen reader. Name
  // the page, and after the first load move focus to the new content.
  useEffect(() => {
    document.title = `${titleFor(location.pathname)} · RaptorTracker`
    if (firstRender.current) { firstRender.current = false; return }
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname])

  // The phone menu closes on Escape.
  useEffect(() => {
    if (!navOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setNavOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  return (
    <div className="flex min-h-screen bg-raptor-base">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-raptor-card focus:text-raptor-primary focus:shadow-lg">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:min-h-screen bg-raptor-sidebar flex-shrink-0">
        <Nav onClose={() => setNavOpen(false)} onSearch={() => setPaletteOpen(true)} />
      </aside>

      {/* Mobile overlay */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      {/* Off-screen when closed, and inert so Tab doesn't wander into it. */}
      <aside
        aria-label="Menu"
        inert={navOpen ? undefined : ''}
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-raptor-sidebar transform transition-transform duration-200 lg:hidden ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Nav onClose={() => setNavOpen(false)} onSearch={() => { setNavOpen(false); setPaletteOpen(true) }} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-raptor-sidebar sticky top-0 z-30">
          <button
            onClick={() => setNavOpen(true)}
            className="text-white/70 hover:text-white p-1 rounded"
            aria-label="Open menu"
          >
            <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-display font-bold text-xl text-white tracking-wide">RaptorTracker</span>
          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-auto text-white/70 hover:text-white p-1 rounded"
            aria-label="Search"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
          </button>
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 p-4 lg:p-6 overflow-auto focus:outline-none">
          {children}
        </main>

        <footer className="px-4 lg:px-6 py-3 border-t border-raptor-border flex items-center justify-between gap-4">
          <p className="text-xs text-raptor-muted">
            © 2026 breed007 · MIT licensed
          </p>
          <a
            href="https://github.com/breed007/RaptorTracker"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-raptor-muted hover:text-raptor-link transition-colors flex-shrink-0"
          >
            v{__APP_VERSION__} · {__BUILD_DATE__}
          </a>
        </footer>
      </div>

      {/* Floating quick-add — phone only, where fuel/odometer logging happens.
          Hidden on the Quick Add page itself, where it would link to itself. */}
      {location.pathname !== '/quick' && <Link
        to="/quick"
        className="lg:hidden fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full bg-raptor-accent text-raptor-on-accent shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        aria-label="Quick add"
      >
        <svg aria-hidden="true" className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </Link>}

      <Toaster />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
