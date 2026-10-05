import React, { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { makeUnits, DEFAULT_UNITS, setCurrentUnits } from '../lib/units'

const AppContext = createContext(null)

const THEMES = ['ford-racing', 'fordraptorforum', 'raptor-assault']

function applyTheme(theme, dark) {
  document.documentElement.dataset.theme = theme
  // FordRaptorForum is always dark
  const effectiveDark = theme === 'fordraptorforum' ? true : dark
  if (effectiveDark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [userVehicles, setUserVehicles] = useState([])
  const [vehiclesLoaded, setVehiclesLoaded] = useState(false)
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)

  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('theme')
    return THEMES.includes(saved) ? saved : 'ford-racing'
  })

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true'
  })

  useEffect(() => {
    applyTheme(theme, darkMode)
    localStorage.setItem('theme', theme)
    localStorage.setItem('darkMode', darkMode)
  }, [theme, darkMode])

  const setTheme = (t) => {
    if (THEMES.includes(t)) setThemeState(t)
  }

  const toggleDark = () => {
    if (theme === 'fordraptorforum') return // always dark
    setDarkMode(d => !d)
  }

  const effectiveDarkMode = theme === 'fordraptorforum' ? true : darkMode

  // Also re-run after a password change, so the "still on the .env password"
  // banner clears without a reload.
  const refreshUser = async () => {
    try {
      const r = await fetch('/api/auth/me')
      setUser(r.ok ? await r.json() : null)
    } catch (_) { /* leave the current user in place */ }
  }

  useEffect(() => {
    refreshUser().finally(() => setAuthLoading(false))
  }, [])

  const refreshVehicles = async () => {
    const data = await fetch('/api/user-vehicles').then(r => r.json()).catch(() => null)
    if (!data) return []
    setUserVehicles(data)
    setVehiclesLoaded(true)
    if (data.length > 0) {
      setSelectedVehicleId(prev => {
        if (prev && data.some(v => v.id === prev)) return prev
        const saved = localStorage.getItem('selectedVehicleId')
        const found = data.find(v => v.id === parseInt(saved))
        return found ? found.id : data[0].id
      })
    }
    return data
  }

  useEffect(() => {
    if (!user) { setVehiclesLoaded(false); return }
    refreshVehicles()
    refreshUnits()
    refreshUpdate()
  }, [user])

  // Undo from the trash: remount the current page so it refetches, and reload
  // the garage in case a whole vehicle came back.
  const [pageKey, setPageKey] = useState(0)
  useEffect(() => {
    const onRestored = () => { setPageKey(k => k + 1); refreshVehicles() }
    window.addEventListener('raptortracker:restored', onRestored)
    return () => window.removeEventListener('raptortracker:restored', onRestored)
  }, [])

  // The newest release the server has seen on GitHub (Settings -> General).
  const [updateInfo, setUpdateInfo] = useState(null)
  const refreshUpdate = async () => {
    try {
      const r = await fetch('/api/settings/updates')
      if (r.ok) setUpdateInfo(await r.json())
    } catch (_) { /* not worth bothering anyone about */ }
  }

  // Units of measure and currency, loaded once at sign-in and again after the
  // owner changes them. Every page labels and formats through useUnits().
  const [rawUnits, setRawUnits] = useState(DEFAULT_UNITS)
  const refreshUnits = async () => {
    try {
      const r = await fetch('/api/settings/units')
      if (r.ok) setRawUnits((await r.json()).units)
    } catch (_) { /* keep what we have */ }
  }
  const units = useMemo(() => { const m = makeUnits(rawUnits); setCurrentUnits(m); return m }, [rawUnits])

  const selectVehicle = (id) => {
    setSelectedVehicleId(id)
    localStorage.setItem('selectedVehicleId', id)
  }

  const selectedVehicle = userVehicles.find(v => v.id === selectedVehicleId) || null

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setUserVehicles([])
    setSelectedVehicleId(null)
  }

  return (
    <AppContext.Provider value={{
      user, setUser, authLoading, refreshUser,
      units, refreshUnits,
      updateInfo, setUpdateInfo, pageKey,
      userVehicles, setUserVehicles, vehiclesLoaded, refreshVehicles,
      selectedVehicleId, selectedVehicle,
      selectVehicle, logout,
      darkMode: effectiveDarkMode, toggleDark,
      theme, setTheme,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

// Labels and formatters for the owner's units: u.dist, u.fmtDist(n), u.money(n), u.economy(dpv)…
export function useUnits() {
  return useContext(AppContext).units
}
