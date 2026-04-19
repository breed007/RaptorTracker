import React from 'react'

export default function StatsCard({ label, value, sub, accent }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-raptor-muted font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-display font-bold ${accent ? 'text-raptor-accent' : 'text-raptor-primary'}`}>{value}</div>
      {sub && <div className="text-xs text-raptor-muted mt-0.5">{sub}</div>}
    </div>
  )
}
