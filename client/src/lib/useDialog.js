import { useEffect, useRef } from 'react'

// Open dialogs, innermost last: only the top one answers the keyboard.
const stack = []

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keyboard behavior every modal needs: focus moves into the dialog when it
 * opens, Tab stays inside it, Escape closes it, and focus goes back to
 * whatever opened it. Spread the returned props onto the dialog element:
 *
 *   const dialog = useDialog(onClose)
 *   <div {...dialog.props} aria-labelledby="title-id">…</div>
 */
export default function useDialog(onClose, { initialFocus = null } = {}) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement
    const node = ref.current
    const token = {}
    stack.push(token)
    const first = () => (initialFocus && node?.querySelector(initialFocus)) || node?.querySelector(FOCUSABLE) || node
    // After paint, so autofocus inside the dialog and late-rendered content win.
    const t = setTimeout(() => { if (node && !node.contains(document.activeElement)) first()?.focus() }, 0)

    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current?.(); return }
      if (e.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) { e.preventDefault(); node.focus(); return }
      const firstEl = items[0]; const lastEl = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === node)) { e.preventDefault(); lastEl.focus() }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(t)
      stack.splice(stack.indexOf(token), 1)
      document.removeEventListener('keydown', onKey, true)
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus()
    }
  }, [])

  return { ref, props: { ref, role: 'dialog', 'aria-modal': 'true', tabIndex: -1 } }
}
