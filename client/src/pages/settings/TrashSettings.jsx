import React, { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import ConfirmModal from '../../components/ConfirmModal'
import { toast } from '../../lib/toast'

const DAY = 24 * 60 * 60 * 1000

// SQLite's datetime('now') is UTC without a zone marker.
const deletedAt = (s) => new Date(String(s).replace(' ', 'T') + 'Z')

function age(item) {
  const days = Math.floor((Date.now() - deletedAt(item.deleted_at).getTime()) / DAY)
  const left = Math.max(0, item.purgeAfterDays - days)
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  return `Deleted ${when} · gone for good in ${left} day${left === 1 ? '' : 's'}`
}

export default function TrashSettings() {
  const { refreshVehicles } = useApp()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(null)
  const [confirm, setConfirm] = useState(null) // { item } or { all: true }

  const load = () => fetch('/api/trash').then(r => (r.ok ? r.json() : null)).then(setData).catch(() => {})
  useEffect(() => { load() }, [])

  const restore = async (item) => {
    setBusy(item.id)
    try {
      const res = await fetch(`/api/trash/${item.id}/restore`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        toast(`Restored “${item.title}”.`, { tone: 'success' })
        if (item.table_name === 'user_vehicles') refreshVehicles()
      } else {
        toast(body.error || 'Could not restore it.', { tone: 'error' })
      }
      load()
    } finally { setBusy(null) }
  }

  const purge = async () => {
    const target = confirm
    setConfirm(null)
    const res = await fetch(target.all ? '/api/trash' : `/api/trash/${target.item.id}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      toast(`Deleted ${body.purged} item${body.purged === 1 ? '' : 's'} for good${body.filesRemoved ? ` and ${body.filesRemoved} file${body.filesRemoved === 1 ? '' : 's'}` : ''}.`, { tone: 'success' })
    }
    load()
  }

  if (!data) return <div className="text-raptor-muted animate-pulse text-sm">Loading…</div>
  const { items, retentionDays } = data

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-raptor-secondary flex-1">
          Deleted records stay here for {retentionDays} days, with their photos and files, and then they&apos;re
          removed for good. Restoring puts a record back exactly where it was.
        </p>
        {items.length > 0 && (
          <button type="button" onClick={() => setConfirm({ all: true })} className="btn-secondary text-sm">Empty trash</button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card p-6 text-center text-sm text-raptor-secondary">The trash is empty.</div>
      ) : (
        <ul className="card divide-y divide-raptor-border">
          {items.map(item => (
            <li key={item.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-raptor-primary truncate">
                  <span className="text-xs font-semibold uppercase tracking-wide text-raptor-muted mr-2">{item.kind}</span>
                  {item.title}
                </div>
                <div className="text-xs text-raptor-muted mt-0.5">
                  {[
                    item.table_name !== 'user_vehicles' && item.vehicle_name,
                    item.record_count > 1 && `${item.record_count - 1} related record${item.record_count === 2 ? '' : 's'}`,
                    item.files > 0 && `${item.files} file${item.files === 1 ? '' : 's'}`,
                    age(item),
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button type="button" disabled={busy === item.id} onClick={() => restore(item)} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                {busy === item.id ? 'Restoring…' : 'Restore'}
              </button>
              <button type="button" onClick={() => setConfirm({ item })} className="text-xs text-raptor-muted hover:text-red-500 px-1">
                Delete for good
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.all ? 'Empty the trash' : 'Delete for good'}
          message={confirm.all
            ? `Permanently delete all ${items.length} item${items.length === 1 ? '' : 's'} in the trash, with their photos and files? This can't be undone.`
            : `Permanently delete “${confirm.item.title}” and its files? This can't be undone.`}
          danger
          onConfirm={purge}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
