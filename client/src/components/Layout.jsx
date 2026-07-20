import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Nav from './Nav'
import CommandPalette from './CommandPalette'

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

  return (
    <div className="flex min-h-screen bg-raptor-base">
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
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-raptor-sidebar transform transition-transform duration-200 lg:hidden ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}>
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
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-display font-bold text-xl text-white tracking-wide">RaptorTracker</span>
          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-auto text-white/70 hover:text-white p-1 rounded"
            aria-label="Search"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
          </button>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
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
            className="text-xs text-raptor-muted hover:text-raptor-accent transition-colors flex-shrink-0"
          >
            v{__APP_VERSION__} · {__BUILD_DATE__}
          </a>
        </footer>
      </div>

      {/* Floating quick-add — phone only, where fuel/odometer logging happens */}
      <Link
        to="/quick"
        className="lg:hidden fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full bg-raptor-accent text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        aria-label="Quick add"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </Link>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
