import React, { useEffect, useState } from 'react'
import { subscribe } from '../lib/toast'

const TONES = {
  info: 'border-raptor-border',
  success: 'border-l-4 border-l-green-500 border-raptor-border',
  warning: 'border-l-4 border-l-yellow-500 border-raptor-border',
  error: 'border-l-4 border-l-red-500 border-raptor-border',
}

export default function Toaster() {
  const [items, setItems] = useState([])

  useEffect(() => subscribe(item => {
    setItems(list => [...list.slice(-3), item])
    setTimeout(() => setItems(list => list.filter(i => i.id !== item.id)), item.duration)
  }), [])

  const dismiss = (id) => setItems(list => list.filter(i => i.id !== id))

  return (
    <div
      aria-live="polite"
      className="fixed z-50 bottom-20 lg:bottom-5 left-4 right-4 sm:left-auto sm:right-5 sm:w-96 space-y-2 pointer-events-none"
    >
      {items.map(item => (
        <div
          key={item.id}
          role={item.tone === 'error' || item.tone === 'warning' ? 'alert' : 'status'}
          className={`pointer-events-auto card shadow-lg px-4 py-3 flex items-start gap-3 border ${TONES[item.tone] || TONES.info}`}
        >
          <p className="flex-1 text-sm text-raptor-primary">{item.message}</p>
          {item.action && (
            <button
              type="button"
              onClick={() => { dismiss(item.id); item.action.onClick() }}
              className="text-sm font-semibold text-raptor-link underline underline-offset-2 hover:no-underline -my-0.5 px-1"
            >
              {item.action.label}
            </button>
          )}
          <button
            onClick={() => dismiss(item.id)}
            aria-label="Dismiss notification"
            className="text-raptor-muted hover:text-raptor-primary -mr-1 p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
