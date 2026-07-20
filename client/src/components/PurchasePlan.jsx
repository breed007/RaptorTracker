import React, { useCallback, useEffect, useState } from 'react'

const money = (v, dp = 0) =>
  v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

const fmtMonth = (d) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'

const PRIORITY_CLS = {
  high: 'bg-red-500/15 text-red-500',
  medium: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-500',
  low: 'bg-raptor-elevated text-raptor-muted',
}

/**
 * Wishlist × cost of ownership. Answers the question the wishlist alone can't:
 * given what this truck already costs every month, when can I actually buy the
 * next thing on the list?
 */
export default function PurchasePlan({ vehicleId, refreshKey }) {
  const [data, setData] = useState(null)
  const [budgetInput, setBudgetInput] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    if (!vehicleId) return
    fetch(`/api/budget?vehicle_id=${vehicleId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setData(d)
        if (d) setBudgetInput(d.monthlyBudget != null ? String(d.monthlyBudget) : '')
      })
      .catch(() => {})
  }, [vehicleId])

  useEffect(() => { load() }, [load, refreshKey])

  const saveBudget = async () => {
    setSaving(true)
    try {
      await fetch('/api/budget', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle_id: vehicleId, monthly_budget: budgetInput === '' ? null : budgetInput }),
      })
      load()
    } finally { setSaving(false) }
  }

  if (!data) return null

  const { commitments, available, monthlyBudget, historicalModRate, wishlist, plan } = data
  const noRoom = monthlyBudget != null && available != null && available <= 0

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="section-title">Purchase Plan</div>
        {wishlist.count > 0 && (
          <span className="text-xs text-raptor-muted">
            {wishlist.count} item{wishlist.count === 1 ? '' : 's'} · {money(wishlist.total)}
            {wishlist.unpriced > 0 && ` (${wishlist.unpriced} unpriced)`}
          </span>
        )}
      </div>

      {/* What the truck already costs each month */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: data.ownershipType === 'lease' ? 'Lease' : data.ownershipType === 'loan' ? 'Loan' : 'Financing', value: commitments.financing },
          { label: 'Fuel (avg)', value: commitments.fuel },
          { label: 'Maintenance (avg)', value: commitments.maintenance },
          { label: 'Committed / mo', value: commitments.total, strong: true },
        ].map(c => (
          <div key={c.label} className="rounded-lg bg-raptor-elevated border border-raptor-border p-3">
            <div className="text-xs text-raptor-muted">{c.label}</div>
            <div className={`mt-0.5 ${c.strong ? 'text-lg font-semibold text-raptor-primary' : 'text-base text-raptor-secondary'}`}>
              {money(c.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Budget entry */}
      <div className="flex flex-wrap items-end gap-3 pt-1">
        <div>
          <label className="label">Monthly vehicle budget</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-raptor-muted text-sm">$</span>
            <input
              type="number" min="0" step="10"
              value={budgetInput}
              onChange={e => setBudgetInput(e.target.value)}
              onBlur={saveBudget}
              className="input-field pl-7 w-40"
              placeholder="e.g. 800"
            />
          </div>
        </div>
        {monthlyBudget != null && (
          <div className="pb-2">
            <span className="text-sm text-raptor-secondary">Leaves </span>
            <span className={`text-lg font-semibold ${available > 0 ? 'text-raptor-accent' : 'text-red-500'}`}>{money(available)}</span>
            <span className="text-sm text-raptor-secondary"> / month for mods</span>
          </div>
        )}
        {saving && <span className="text-xs text-raptor-muted pb-3">Saving…</span>}
      </div>

      {monthlyBudget == null && (
        <p className="text-sm text-raptor-secondary">
          Set a total monthly budget for the truck and this will show when each wishlist item becomes affordable.
          {historicalModRate > 0 && ` For reference, you've averaged ${money(historicalModRate)}/month on mods so far.`}
        </p>
      )}

      {noRoom && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500 dark:text-red-400">
          Committed costs already meet or exceed that budget, so there's nothing left for mods.
          Raise the budget or reduce recurring costs to see a timeline.
        </div>
      )}

      {/* The plan */}
      {plan.length === 0 ? (
        <p className="text-sm text-raptor-secondary">Nothing on the wishlist yet.</p>
      ) : (
        <div className="divide-y divide-raptor-border border-t border-raptor-border">
          {plan.map(item => (
            <div key={item.id} className="py-2.5 flex items-center gap-3 text-sm">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${PRIORITY_CLS[item.priority] || PRIORITY_CLS.medium}`}>
                {item.priority}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-raptor-primary font-medium truncate">{item.part_name}</span>
                {item.brand && <span className="block text-xs text-raptor-muted truncate">{item.brand}</span>}
              </span>
              <span className="text-raptor-secondary flex-shrink-0 w-20 text-right tabular-nums">
                {item.estimatedCost != null ? money(item.estimatedCost) : <span className="text-raptor-muted text-xs">no price</span>}
              </span>
              <span className="flex-shrink-0 w-24 text-right text-xs">
                {item.projectedDate ? (
                  <span className="text-raptor-secondary">{fmtMonth(item.projectedDate)}</span>
                ) : (
                  <span className="text-raptor-muted">—</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {wishlist.monthsToClear != null && (
        <p className="text-xs text-raptor-muted">
          At {money(available)}/month you'd clear the whole list in about {wishlist.monthsToClear} month{wishlist.monthsToClear === 1 ? '' : 's'}.
          Items are ordered by priority, then cheapest first — dates assume you buy them in that order.
        </p>
      )}
    </div>
  )
}
