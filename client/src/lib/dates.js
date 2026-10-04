// Today's date as YYYY-MM-DD in the browser's own time zone. toISOString()
// is UTC, which made every date field default to tomorrow from the late
// afternoon onward anywhere in the Americas.
export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
