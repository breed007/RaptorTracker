import { localDate } from './dates'

// Recalls are listed by make, model, and year, so each one is triaged by the
// owner: 'review' (may apply), 'applies' (confirmed by VIN), 'fixed', or
// 'not_applicable'. These two calls are shared by the dashboard and the
// Recalls page.

export async function setRecallState(vehicleId, campaign, state) {
  const res = await fetch('/api/recalls/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicle_id: vehicleId, campaign, state }),
  })
  return res.ok
}

// Log the dealer repair as a service record, then mark the recall fixed.
export async function logRecallAsService(vehicleId, recall) {
  const notes = [
    recall.campaign ? `NHTSA campaign ${recall.campaign}` : null,
    recall.component ? `Component: ${recall.component}` : null,
    recall.summary || null,
    recall.remedy ? `Remedy: ${recall.remedy}` : null,
  ].filter(Boolean).join('\n\n')
  const res = await fetch('/api/maintenance', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_vehicle_id: vehicleId,
      service_type: `Recall: ${recall.title || recall.component || 'repair'}${recall.campaign ? ` (${recall.campaign})` : ''}`,
      date_performed: localDate(),
      service_provider_type: 'dealership',
      notes,
    }),
  }).catch(() => null)
  if (!res || !res.ok) return false
  await setRecallState(vehicleId, recall.campaign, 'fixed')
  return true
}
