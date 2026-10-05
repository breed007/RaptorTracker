import React from 'react'
import useDialog from '../lib/useDialog'

/**
 * The panel of a modal: role="dialog", focus moved in and kept in, Escape to
 * close, focus handed back on close. Name it with labelledBy (an element id)
 * or label.
 */
export default function Dialog({ onClose, labelledBy, label, className, initialFocus, children, ...rest }) {
  const dialog = useDialog(onClose, { initialFocus })
  return (
    <div {...rest} {...dialog.props} aria-labelledby={labelledBy} aria-label={label} className={className}>
      {children}
    </div>
  )
}
