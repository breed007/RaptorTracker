// Today's date as YYYY-MM-DD in the browser's own time zone. toISOString()
// is UTC, which made every date field default to tomorrow from the late
// afternoon onward anywhere in the Americas.
export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// "in 1129 days" told nobody anything. Scale the unit to the distance, and
// let callers add the month/year for anything far off.
export function formatDue(days) {
  if (days == null) return ''
  const d = Math.round(days)
  if (d <= 0) return 'due now'
  if (d === 1) return 'tomorrow'
  if (d < 14) return `in ${d} days`
  if (d < 60) return `in ${Math.round(d / 7)} weeks`
  if (d < 730) return `in ${Math.round(d / 30.44)} months`
  return `in about ${Math.round(d / 365.25)} years`
}

// "Nov 2029" for a YYYY-MM-DD date — used beside formatDue for far-off dates.
export function monthYear(iso) {
  if (!iso) return ''
  const [y, m] = String(iso).split('-').map(Number)
  if (!y || !m) return ''
  return new Date(y, m - 1, 15).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
