// Links that come back from the server (search results, logbook entries,
// dashboard items) are built from record IDs, but route them through this
// anyway: only same-app paths are followed. A leading "//" or "/\" would be
// read by the browser as another host.
export function internalPath(link) {
  if (typeof link !== 'string') return null
  if (!link.startsWith('/') || link.startsWith('//') || link.startsWith('/\\')) return null
  return link
}
