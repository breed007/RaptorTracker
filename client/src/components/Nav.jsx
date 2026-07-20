import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import VehicleSelector from './VehicleSelector'

// Grouped navigation. Fifteen flat links had outgrown the sidebar; sections
// give the app a shape you can scan instead of a wall of equal-weight rows.
const navGroups = [
  {
    group: null,
    items: [
      { to: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    ],
  },
  {
    group: 'Build',
    items: [
      { to: '/mods',     label: 'Modifications', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
      { to: '/aux',      label: 'AUX Panel',   icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
      { to: '/tires',    label: 'Tire Sets',   icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 6a4 4 0 100 8 4 4 0 000-8z' },
      { to: '/wishlist', label: 'Wishlist',    icon: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z' },
      { to: '/share',    label: 'Share Build', icon: 'M8.684 13.342a3 3 0 100-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.368-2.684 3 3 0 00-5.368 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z' },
    ],
  },
  {
    group: 'Drive & Maintain',
    items: [
      { to: '/maintenance', label: 'Maintenance', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      { to: '/fuel',        label: 'Fuel Log',    icon: 'M3 10h2l1 9h12l1-9h2M7 10V7a5 5 0 0110 0v3' },
      { to: '/outings',     label: 'Trail Log',   icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
      { to: '/warranty',    label: 'Warranty',    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    ],
  },
  {
    group: 'Insights',
    items: [
      { to: '/tco',       label: 'Cost of Ownership', icon: 'M9 8h6m-6 4h6m-3 4h3M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z' },
      { to: '/analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { to: '/logbook',   label: 'Logbook',   icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    ],
  },
  {
    group: 'Garage',
    items: [
      { to: '/garage',   label: 'My Garage', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
      { to: '/vehicles', label: 'Reference', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
    ],
  },
  {
    group: 'Settings',
    items: [
      { to: '/notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
      { to: '/export',        label: 'Export & Backup', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' },
      { to: '/account',       label: 'Account', icon: 'M12 11c0-1.105.895-2 2-2h.5a2.5 2.5 0 000-5H12a4 4 0 100 8zm0 0v3m-7 7h14a2 2 0 002-2v-5a2 2 0 00-2-2H5a2 2 0 00-2 2v5a2 2 0 002 2z' },
    ],
  },
]

const THEME_OPTIONS = [
  {
    id: 'ford-racing',
    label: 'Ford Racing',
    swatch: '#003478',
    swatchDark: '#FF6B00',
  },
  {
    id: 'fordraptorforum',
    label: 'FRF Forum',
    swatch: '#ba220a',
    swatchDark: '#ba220a',
  },
  {
    id: 'raptor-assault',
    label: 'Raptor Assault',
    swatch: '#ff0000',
    swatchDark: '#ff0000',
  },
]

export default function Nav({ onClose, onSearch }) {
  const { logout, darkMode, toggleDark, theme, setTheme } = useApp()
  const navigate = useNavigate()
  const [themeOpen, setThemeOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const canToggleDark = theme !== 'fordraptorforum'

  return (
    <div className="flex flex-col h-full">
      {/* Wordmark */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <span className="font-display font-bold text-xl text-white tracking-wide">RaptorTracker</span>
          <button onClick={onClose} className="lg:hidden text-white/60 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Vehicle selector */}
      <div className="px-3 py-3 border-b border-white/10">
        <VehicleSelector />
      </div>

      {/* Search */}
      <div className="px-2 pt-3">
        <button
          onClick={onSearch}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-xs border border-white/20 rounded px-1">⌘K</kbd>
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navGroups.map(({ group, items }) => (
          <div key={group || 'main'} className={group ? 'pt-3' : ''}>
            {group && (
              <div className="px-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-white/35">
                {group}
              </div>
            )}
            {items.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-100 ${
                    isActive
                      ? 'text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`
                }
                style={({ isActive }) => isActive ? { backgroundColor: 'var(--rl-sidebar-active-bg)' } : {}}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-white/10 space-y-0.5">

        {/* Theme picker toggle */}
        <button
          onClick={() => setThemeOpen(o => !o)}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          <span className="flex-1 text-left">Theme</span>
          <svg className={`w-3 h-3 transition-transform ${themeOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {themeOpen && (
          <div className="mx-1 mb-1 rounded-lg overflow-hidden border border-white/10">
            {THEME_OPTIONS.map(t => (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id); setThemeOpen(false) }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors hover:bg-white/10"
              >
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white/20"
                  style={{ background: darkMode ? t.swatchDark : t.swatch }}
                />
                <span className={theme === t.id ? 'text-white font-medium' : 'text-white/60'}>
                  {t.label}
                </span>
                {theme === t.id && (
                  <svg className="w-3.5 h-3.5 text-white ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Dark mode toggle */}
        {canToggleDark && (
          <button
            onClick={toggleDark}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
            {darkMode ? 'Light Mode' : 'Dark Mode'}
          </button>
        )}

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  )
}
