import React from 'react'
import { useApp } from '../context/AppContext'

export default function VehicleSelector() {
  const { userVehicles, selectedVehicleId, selectVehicle } = useApp()

  if (userVehicles.length === 0) {
    return <div className="text-xs text-white/40">No vehicles — add one in Garage</div>
  }

  if (userVehicles.length === 1) {
    const v = userVehicles[0]
    return (
      <div className="text-xs">
        <div className="text-white font-semibold truncate">{v.nickname}</div>
        <div className="text-white/50">{v.model_year} {v.model}</div>
      </div>
    )
  }

  return (
    <select
      value={selectedVehicleId || ''}
      onChange={e => selectVehicle(parseInt(e.target.value))}
      className="w-full bg-white/10 border border-white/20 text-white text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-white/50"
    >
      {userVehicles.map(v => (
        <option key={v.id} value={v.id} style={{ background: '#003478' }}>
          {v.nickname} ({v.model_year})
        </option>
      ))}
    </select>
  )
}
