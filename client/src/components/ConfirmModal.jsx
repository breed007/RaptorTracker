import React from 'react'

export default function ConfirmModal({ title, message, onConfirm, onCancel, danger }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative card p-6 w-full max-w-sm z-10 shadow-xl">
        <h3 className="text-lg font-display font-bold text-raptor-primary mb-2">{title}</h3>
        <p className="text-raptor-secondary text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            className={danger ? 'btn-danger text-sm' : 'btn-primary text-sm'}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
