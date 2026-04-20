import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Garage from './pages/Garage'
import Vehicles from './pages/Vehicles'
import ModList from './pages/ModList'
import ModDetail from './pages/ModDetail'
import AuxPanel from './pages/AuxPanel'
import Maintenance from './pages/Maintenance'
import Export from './pages/Export'
import Wishlist from './pages/Wishlist'
import FuelLog from './pages/FuelLog'

function AppRoutes() {
  const { user, authLoading } = useApp()

  if (authLoading) {
    return (
      <div className="min-h-screen bg-raptor-base flex items-center justify-center">
        <div className="font-display font-bold text-2xl text-raptor-accent animate-pulse tracking-wide">
          RaptorTracker
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/garage" element={<Garage />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/mods" element={<ModList />} />
        <Route path="/mods/new" element={<ModDetail isNew />} />
        <Route path="/mods/:id" element={<ModDetail />} />
        <Route path="/aux" element={<AuxPanel />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/fuel" element={<FuelLog />} />
        <Route path="/export" element={<Export />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  )
}
