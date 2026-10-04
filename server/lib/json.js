// JSON columns (photos, attachments, AUX assignments) are read on every list
// request. A single corrupt value used to throw inside .map() and turn the
// whole list into a 500 — the same failure that once blanked the mods page.
// Read them defensively: a bad value becomes an empty list and is logged once.
const warned = new Set();

function jsonList(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    const key = String(value).slice(0, 80);
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[data] could not read a stored list value, treating it as empty: ${key}`);
    }
    return [];
  }
}

module.exports = { jsonList };
