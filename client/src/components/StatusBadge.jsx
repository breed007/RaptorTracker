import React from 'react'

const STATUS_STYLES = {
  Installed:   'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/50 dark:text-green-400 dark:border-green-800',
  Ordered:     'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/50 dark:text-blue-400 dark:border-blue-800',
  In_Transit:  'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/50 dark:text-amber-400 dark:border-amber-800',
  Researching: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600',
  Removed:     'bg-red-100 text-red-600 border-red-300 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900',
}

const STATUS_LABELS = {
  In_Transit: 'In Transit',
}

export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.Researching
  const label = STATUS_LABELS[status] || status
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${style}`}>
      {label}
    </span>
  )
}
