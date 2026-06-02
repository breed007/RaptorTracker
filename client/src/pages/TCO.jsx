import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useApp } from '../context/AppContext'
import StatsCard from '../components/StatsCard'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

const OWNERSHIP = [
  { value: 'owned', label: 'Owned Outright' },
  { value: 'loan', label: 'Financed (Loan)' },
  { value: 'lease', label: 'Leased' },
]

function money(v, decimals = 0) {
  if (v == null || v === '') return '—'
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const EMPTY_FIN = {
  ownership_type: 'owned', purchase_price: '',
  loan_lender: '', loan_amount: '', loan_apr: '', loan_term_months: '', loan_start_date: '',
  loan_monthly_payment: '', loan_down_payment: '',
  lease_lender: '', lease_monthly_payment: '', lease_term_months: '', lease_start_date: '',
  lease_down_payment: '', lease_mileage_allowance: '', lease_buyout: '',
}

export default function TCO() {
  const { selectedVehicleId } = useApp()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [editFin, setEditFin] = useState(false)
  const [fin, setFin] = useState(EMPTY_FIN)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(() => {
    if (!selectedVehicleId) return
    setLoading(true); setError('')
    Promise.all([
      fetch(`/api/tco?vehicle_id=${selectedVehicleId}`).then(r => r.ok ? r.json() : Promise.reject()),
      fetch(`/api/user-vehicles/${selectedVehicleId}`).then(r => r.ok ? r.json() : null),
    ])
      .then(([tco, veh]) => {
        setData(tco)
        if (veh) {
          setFin({
            ownership_type: veh.ownership_type || 'owned',
            purchase_price: veh.purchase_price ?? '',
            loan_lender: veh.loan_lender || '', loan_amount: veh.loan_amount ?? '',
            loan_apr: veh.loan_apr ?? '', loan_term_months: veh.loan_term_months ?? '',
            loan_start_date: veh.loan_start_date || '', loan_monthly_payment: veh.loan_monthly_payment ?? '',
            loan_down_payment: veh.loan_down_payment ?? '',
            lease_lender: veh.lease_lender || '', lease_monthly_payment: veh.lease_monthly_payment ?? '',
            lease_term_months: veh.lease_term_months ?? '', lease_start_date: veh.lease_start_date || '',
            lease_down_payment: veh.lease_down_payment ?? '', lease_mileage_allowance: veh.lease_mileage_allowance ?? '',
            lease_buyout: veh.lease_buyout ?? '',
          })
        }
      })
      .catch(() => setError('Failed to load cost data'))
      .finally(() => setLoading(false))
  }, [selectedVehicleId])

  useEffect(() => { fetchData() }, [fetchData])

  const setF = (k, v) => setFin(f => ({ ...f, [k]: v }))

  const saveFinancing = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/user-vehicles/${selectedVehicleId}/financing`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fin),
      })
      if (res.ok) { setEditFin(false); fetchData() }
    } finally { setSaving(false) }
  }

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <p className="text-raptor-secondary">No vehicle selected.</p>
        <Link to="/garage" className="btn-primary">Add a Vehicle</Link>
      </div>
    )
  }

  const f = data?.financing
  const s = data?.spend

  // Chart: cumulative spend over time
  const chartData = {
    labels: (data?.timeline || []).map(t => t.month),
    datasets: [{
      data: (data?.timeline || []).map(t => t.cumulative),
      borderColor: getComputedStyle(document.documentElement).getPropertyValue('--rl-accent').trim() || '#f97316',
      backgroundColor: (getComputedStyle(document.documentElement).getPropertyValue('--rl-accent').trim() || '#f97316') + '22',
      borderWidth: 2, pointRadius: 2, fill: true, tension: 0.25,
    }],
  }
  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => money(c.parsed.y) } } },
    scales: {
      x: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { display: false } },
      y: { ticks: { color: '#9ca3af', font: { size: 10 }, callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#ffffff10' } },
    },
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Total Cost of Ownership</h1>
        <button onClick={() => setEditFin(o => !o)} className="btn-secondary text-sm">
          {editFin ? 'Close' : 'Edit Financing'}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {loading && !data ? <div className="text-raptor-muted animate-pulse text-sm">Loading…</div> : null}

      {/* Financing editor */}
      {editFin && (
        <div className="card p-5">
          <div className="section-title mb-4">Financing</div>
          <form onSubmit={saveFinancing} className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {OWNERSHIP.map(o => (
                <button
                  key={o.value} type="button"
                  onClick={() => setF('ownership_type', o.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    fin.ownership_type === o.value
                      ? 'bg-raptor-accent text-white border-raptor-accent'
                      : 'border-raptor-border text-raptor-secondary hover:text-raptor-primary'
                  }`}
                >{o.label}</button>
              ))}
            </div>

            {fin.ownership_type === 'owned' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Purchase Price</label>
                  <input type="number" step="0.01" value={fin.purchase_price} onChange={e => setF('purchase_price', e.target.value)} className="input-field" placeholder="e.g. 78000" />
                </div>
              </div>
            )}

            {fin.ownership_type === 'loan' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="label">Lender</label><input value={fin.loan_lender} onChange={e => setF('loan_lender', e.target.value)} className="input-field" placeholder="e.g. Ford Credit" /></div>
                <div><label className="label">Purchase Price</label><input type="number" step="0.01" value={fin.purchase_price} onChange={e => setF('purchase_price', e.target.value)} className="input-field" /></div>
                <div><label className="label">Amount Financed</label><input type="number" step="0.01" value={fin.loan_amount} onChange={e => setF('loan_amount', e.target.value)} className="input-field" /></div>
                <div><label className="label">Down Payment</label><input type="number" step="0.01" value={fin.loan_down_payment} onChange={e => setF('loan_down_payment', e.target.value)} className="input-field" /></div>
                <div><label className="label">APR (%)</label><input type="number" step="0.01" value={fin.loan_apr} onChange={e => setF('loan_apr', e.target.value)} className="input-field" placeholder="e.g. 6.9" /></div>
                <div><label className="label">Monthly Payment</label><input type="number" step="0.01" value={fin.loan_monthly_payment} onChange={e => setF('loan_monthly_payment', e.target.value)} className="input-field" /></div>
                <div><label className="label">Term (months)</label><input type="number" value={fin.loan_term_months} onChange={e => setF('loan_term_months', e.target.value)} className="input-field" placeholder="e.g. 72" /></div>
                <div><label className="label">First Payment Date</label><input type="date" value={fin.loan_start_date} onChange={e => setF('loan_start_date', e.target.value)} className="input-field" /></div>
              </div>
            )}

            {fin.ownership_type === 'lease' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="label">Leasing Company</label><input value={fin.lease_lender} onChange={e => setF('lease_lender', e.target.value)} className="input-field" placeholder="e.g. Ford Credit" /></div>
                <div><label className="label">Monthly Payment</label><input type="number" step="0.01" value={fin.lease_monthly_payment} onChange={e => setF('lease_monthly_payment', e.target.value)} className="input-field" /></div>
                <div><label className="label">Due at Signing</label><input type="number" step="0.01" value={fin.lease_down_payment} onChange={e => setF('lease_down_payment', e.target.value)} className="input-field" /></div>
                <div><label className="label">Term (months)</label><input type="number" value={fin.lease_term_months} onChange={e => setF('lease_term_months', e.target.value)} className="input-field" placeholder="e.g. 36" /></div>
                <div><label className="label">First Payment Date</label><input type="date" value={fin.lease_start_date} onChange={e => setF('lease_start_date', e.target.value)} className="input-field" /></div>
                <div><label className="label">Mileage Allowance / yr</label><input type="number" value={fin.lease_mileage_allowance} onChange={e => setF('lease_mileage_allowance', e.target.value)} className="input-field" placeholder="e.g. 12000" /></div>
                <div><label className="label">Buyout / Residual</label><input type="number" step="0.01" value={fin.lease_buyout} onChange={e => setF('lease_buyout', e.target.value)} className="input-field" /></div>
              </div>
            )}

            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Save Financing'}</button>
              <button type="button" onClick={() => setEditFin(false)} className="btn-secondary text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {data && (
        <>
          {/* Headline stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatsCard label="Total Cost of Ownership" value={money(s.total)} sub="acquisition + running" accent />
            <StatsCard label="Cost / Mile" value={data.costPerMile != null ? '$' + data.costPerMile.toFixed(2) : '—'} sub={data.operatingCostPerMile != null ? `$${data.operatingCostPerMile.toFixed(2)} operating` : null} />
            <StatsCard label="Miles Driven" value={data.milesDriven != null ? data.milesDriven.toLocaleString() : '—'} sub={data.milesDriven == null ? 'set mileage in Maintenance' : 'since purchase'} />
            <StatsCard label="Running Costs" value={money(s.operating)} sub="mods + service + fuel" />
          </div>

          {/* Spend breakdown */}
          <div className="card p-5">
            <div className="section-title mb-4">Where the Money Went</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Breakdown label={f.type === 'lease' ? 'Lease (to date)' : f.type === 'loan' ? 'Financing (to date)' : 'Purchase'} value={s.financing} />
              <Breakdown label="Modifications" value={s.mods} />
              <Breakdown label="Maintenance" value={s.maintenance} />
              <Breakdown label="Fuel" value={s.fuel} />
              <Breakdown label="Tires & Wheels" value={s.tires} />
            </div>
          </div>

          {/* Financing detail */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="section-title">Financing — {OWNERSHIP.find(o => o.value === f.type)?.label || f.type}</div>
              {!editFin && <button onClick={() => setEditFin(true)} className="text-xs text-raptor-accent hover:underline">Edit</button>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4 text-sm">
              {f.type === 'owned' && (
                <Detail label="Purchase Price" value={money(f.upfront)} />
              )}
              {f.type === 'loan' && (
                <>
                  <Detail label="Down Payment" value={money(f.upfront)} />
                  <Detail label="Monthly Payment" value={money(f.monthly, 2)} />
                  <Detail label="Paid to Date" value={money(f.paidToDate)} />
                  <Detail label="Remaining" value={f.remaining != null ? money(f.remaining) : '—'} />
                  <Detail label="Total Interest" value={f.totalInterest != null ? money(f.totalInterest) : '—'} />
                  <Detail label="Progress" value={f.termMonths ? `${f.monthsElapsed} / ${f.termMonths} mo` : '—'} />
                </>
              )}
              {f.type === 'lease' && (
                <>
                  <Detail label="Due at Signing" value={money(f.upfront)} />
                  <Detail label="Monthly Payment" value={money(f.monthly, 2)} />
                  <Detail label="Paid to Date" value={money(f.paidToDate)} />
                  <Detail label="Remaining" value={f.remaining != null ? money(f.remaining) : '—'} />
                  <Detail label="Buyout / Residual" value={f.buyout != null ? money(f.buyout) : '—'} />
                  <Detail label="Progress" value={f.termMonths ? `${f.monthsElapsed} / ${f.termMonths} mo` : '—'} />
                </>
              )}
            </div>
            {(f.type === 'owned' && !f.upfront) && (
              <p className="text-xs text-raptor-muted mt-3">No financing details yet — click Edit to add them.</p>
            )}
          </div>

          {/* Cumulative spend chart */}
          {data.timeline.length >= 2 && (
            <div className="card p-5">
              <div className="section-title mb-3">Cumulative Spend Over Time</div>
              <div style={{ height: 200 }}><Line data={chartData} options={chartOpts} /></div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Breakdown({ label, value }) {
  return (
    <div className="rounded-lg bg-raptor-elevated border border-raptor-border p-3">
      <div className="text-xs text-raptor-muted">{label}</div>
      <div className="text-lg font-semibold text-raptor-primary mt-0.5">{money(value)}</div>
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <div className="text-xs text-raptor-muted">{label}</div>
      <div className="text-raptor-primary font-medium">{value}</div>
    </div>
  )
}
