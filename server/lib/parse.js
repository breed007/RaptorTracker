// Form values arrive as numbers, numeric strings, or empty strings. An empty
// field means "not recorded" (null) — never 0, and never NaN, which is what
// parseFloat('') would quietly store.
function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toInt(v) {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
}

module.exports = { toNum, toInt };
