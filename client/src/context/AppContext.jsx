import React, { createContext, useContext, useState, useEffect } from 'react'

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

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setUser(data)
        setAuthLoading(false)
      })
      .catch(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    if (!user) return
    fetch('/api/user-vehicles')
      .then(r => r.json())
      .then(data => {
        setUserVehicles(data)
        if (data.length > 0 && !selectedVehicleId) {
          const saved = localStorage.getItem('selectedVehicleId')
          const found = data.find(v => v.id === parseInt(saved))
          setSelectedVehicleId(found ? found.id : data[0].id)
        }
      })
      .catch(() => {})
  }, [user])

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
      user, setUser, authLoading,
      userVehicles, setUserVehicles,
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
