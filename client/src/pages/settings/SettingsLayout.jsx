import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'

export const SETTINGS_TABS = [
  { to: '/settings', label: 'General', end: true },
  { to: '/settings/backups', label: 'Backups' },
  { to: '/settings/data', label: 'Import & Export' },
  { to: '/settings/notifications', label: 'Notifications' },
  { to: '/settings/account', label: 'Account' },
]

/** One home for everything that configures the install rather than the truck. */
export default function SettingsLayout() {
  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="page-title">Settings</h1>
      <nav aria-label="Settings sections" className="-mx-1 overflow-x-auto">
        <div className="flex gap-1 px-1 border-b border-raptor-border min-w-max">
          {SETTINGS_TABS.map(t => (
            <NavLink
              key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => `px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-raptor-accent text-raptor-primary'
                  : 'border-transparent text-raptor-secondary hover:text-raptor-primary'}`}
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <Outlet />
    </div>
  )
}
