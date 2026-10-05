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
import Reports from './pages/Reports'
import Wishlist from './pages/Wishlist'
import FuelLog from './pages/FuelLog'
import Warranty from './pages/Warranty'
import TCO from './pages/TCO'
import TireSets from './pages/TireSets'
import Logbook from './pages/Logbook'
import Analytics from './pages/Analytics'
import Welcome from './pages/Welcome'
import QuickAdd from './pages/QuickAdd'
import Outings from './pages/Outings'
import SettingsLayout from './pages/settings/SettingsLayout'
import GeneralSettings from './pages/settings/GeneralSettings'
import BackupSettings from './pages/settings/BackupSettings'
import DataSettings from './pages/settings/DataSettings'
import NotificationsSettings from './pages/settings/NotificationsSettings'
import AccountSettings from './pages/settings/AccountSettings'
import TrashSettings from './pages/settings/TrashSettings'
import ShareBuild from './pages/ShareBuild'
import Recalls from './pages/Recalls'

function AppRoutes() {
  const { user, authLoading, userVehicles, vehiclesLoaded, pageKey } = useApp()

  if (authLoading) {
    return (
      <div className="min-h-screen bg-raptor-base flex items-center justify-center">
        <div className="font-display font-bold text-2xl text-raptor-link animate-pulse tracking-wide">
          RaptorTracker
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  // First run: an empty garage means a brand-new install — walk the owner
  // through adding their truck rather than dropping them into empty pages.
  if (vehiclesLoaded && userVehicles.length === 0) return <Welcome />

  return (
    <Layout>
      <Routes key={pageKey}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/garage" element={<Garage />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/mods" element={<ModList />} />
        <Route path="/mods/new" element={<ModDetail isNew />} />
        <Route path="/mods/:id" element={<ModDetail />} />
        <Route path="/aux" element={<AuxPanel />} />
        <Route path="/share" element={<ShareBuild />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/recalls" element={<Recalls />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/fuel" element={<FuelLog />} />
        <Route path="/tires" element={<TireSets />} />
        <Route path="/outings" element={<Outings />} />
        <Route path="/warranty" element={<Warranty />} />
        <Route path="/tco" element={<TCO />} />
        <Route path="/quick" element={<QuickAdd />} />
        <Route path="/logbook" element={<Logbook />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<GeneralSettings />} />
          <Route path="backups" element={<BackupSettings />} />
          <Route path="data" element={<DataSettings />} />
          <Route path="notifications" element={<NotificationsSettings />} />
          <Route path="account" element={<AccountSettings />} />
          <Route path="trash" element={<TrashSettings />} />
        </Route>
        {/* Pre-1.0 addresses, kept so bookmarks still land somewhere sensible */}
        <Route path="/notifications" element={<Navigate to="/settings/notifications" replace />} />
        <Route path="/account" element={<Navigate to="/settings/account" replace />} />
        <Route path="/export" element={<Navigate to="/reports" replace />} />
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
