import React, { useState } from 'react'
import Nav from './Nav'

export default function Layout({ children }) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-raptor-base">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:min-h-screen bg-raptor-sidebar flex-shrink-0">
        <Nav onClose={() => setNavOpen(false)} />
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
        <Nav onClose={() => setNavOpen(false)} />
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
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>

        <footer className="px-4 lg:px-6 py-3 border-t border-raptor-border flex items-center justify-between gap-4">
          <p className="text-xs text-raptor-muted">
            © Copyright breed breed007@gmail.com 2026
          </p>
          <a
            href="https://github.com/breed007/RaptorTracker"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-raptor-muted hover:text-raptor-accent transition-colors flex-shrink-0"
          >
            v{__APP_VERSION__}
          </a>
        </footer>
      </div>
    </div>
  )
}
