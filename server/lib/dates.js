// Calendar dates (YYYY-MM-DD) in local time. toISOString() reports UTC, so a
// date built at local midnight reads back as the previous day anywhere east
// of UTC (an Australian CSV import shifted every row by one), and "today"
// rolls over to tomorrow during a US evening.
function localDate(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

module.exports = { localDate };
