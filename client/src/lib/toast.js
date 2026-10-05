// A small app-wide notification channel. Anything can call toast(); the
// <Toaster> mounted in Layout renders them.
const listeners = new Set()
let nextId = 1

export function toast(message, { tone = 'info', duration = 6000, action = null } = {}) {
  if (!message) return
  // action: { label, onClick } renders a button in the toast (e.g. Undo).
  const item = { id: nextId++, message, tone, duration, action }
  listeners.forEach(fn => fn(item))
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Saves that carry an odometer reading come back with `odometerWarning` when
// the reading disagrees with the rest of the history (lower than an earlier
// one, or an implausible jump). The record is saved either way; this makes
// sure the owner actually sees why it looks wrong. Installed once in main.jsx
// so every form gets it, including ones added later.
export function watchForOdometerWarnings() {
  if (typeof window === 'undefined' || window.__odometerWatch) return
  window.__odometerWatch = true
  const original = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    const res = await original(input, init)
    const method = (init.method || 'GET').toUpperCase()
    if (method !== 'GET' && (res.headers.get('content-type') || '').includes('application/json')) {
      res.clone().json().then(body => {
        if (body && body.odometerWarning) toast(body.odometerWarning, { tone: 'warning', duration: 12000 })
        if (body && body.trashed && method === 'DELETE') offerUndo(body.trashed, original)
      }).catch(() => {})
    }
    return res
  }
}

// Every delete moves the record to the trash and answers with `trashed`. Offer
// an Undo right there, so no page has to wire it up. A restore announces
// itself with a 'raptortracker:restored' event; the app remounts the page so
// the record reappears.
function offerUndo(trashed, fetchImpl) {
  toast(`Moved “${trashed.title}” to the trash.`, {
    duration: 10000,
    action: {
      label: 'Undo',
      onClick: async () => {
        const res = await fetchImpl(`/api/trash/${trashed.id}/restore`, { method: 'POST' })
        const body = await res.json().catch(() => ({}))
        if (res.ok) {
          window.dispatchEvent(new CustomEvent('raptortracker:restored', { detail: body.restored }))
          toast(`Restored “${trashed.title}”.`, { tone: 'success' })
        } else {
          toast(body.error || 'Could not restore it. Try Settings → Trash.', { tone: 'error' })
        }
      },
    },
  })
}
