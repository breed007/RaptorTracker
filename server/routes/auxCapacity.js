const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// Per-vehicle AUX overrides, mirroring userVehicles.applyAuxOverrides
function layoutFor(uv) {
  const layout = JSON.parse(uv.aux_switch_layout || '[]');
  const dismissed = JSON.parse(uv.dismissed_aux_warnings || '[]');
  const reclaimed = JSON.parse(uv.reclaimed_aux_switches || '[]');
  return layout.map(slot => {
    if (reclaimed.includes(slot.switch_number)) {
      return { ...slot, factory_used: false, warning_note: null, default_label: 'User Available', reclaimed: true };
    }
    if (dismissed.includes(slot.switch_number)) return { ...slot, warning_note: null };
    return slot;
  });
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * GET /api/aux-capacity?vehicle_id=X
 *
 * Electrical planning for the AUX panel: what each switch is rated for, what's
 * already hanging on it, and what the wishlist would add. Nothing else in a
 * generic vehicle tracker knows your truck has six switches at set amperages.
 */
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  const db = getDb();
  const uv = db.prepare(`
    SELECT uv.aux_switch_layout, uv.dismissed_aux_warnings, uv.reclaimed_aux_switches,
           v.aux_switch_count, v.aux_switch_layout AS ref_layout
    FROM user_vehicles uv JOIN vehicles v ON uv.vehicle_id = v.id
    WHERE uv.id = ?
  `).get(vehicle_id);
  if (!uv) return res.status(404).json({ error: 'Not found' });

  // The user_vehicles row has no layout of its own; it comes from the reference vehicle
  const layout = layoutFor({
    aux_switch_layout: uv.ref_layout,
    dismissed_aux_warnings: uv.dismissed_aux_warnings,
    reclaimed_aux_switches: uv.reclaimed_aux_switches,
  });

  if (!layout.length) {
    return res.json({ hasAux: false, switches: [], summary: null, unassigned: [] });
  }

  // Installed/committed mods and their switch assignments
  const mods = db.prepare(`
    SELECT id, part_name, status, amp_draw, aux_switches, aux_switch, aux_label
    FROM mods WHERE user_vehicle_id = ? AND status != 'Removed'
  `).all(vehicle_id).map(m => ({
    ...m,
    switches: (() => {
      const arr = JSON.parse(m.aux_switches || '[]');
      if (arr.length) return arr.map(s => parseInt(s.switch_number)).filter(n => !isNaN(n));
      return m.aux_switch ? [m.aux_switch] : [];
    })(),
  }));

  // Wishlist items that name a target switch
  const planned = db.prepare(`
    SELECT id, part_name, amp_draw, aux_switch, priority
    FROM wishlist WHERE user_vehicle_id = ?
  `).all(vehicle_id);

  const switches = layout.map(slot => {
    const n = slot.switch_number;
    const fuse = slot.fuse_amps || null;

    const onIt = mods.filter(m => m.switches.includes(n))
      .map(m => ({ id: m.id, name: m.part_name, status: m.status, amps: m.amp_draw }));
    const plannedOnIt = planned.filter(w => w.aux_switch === n)
      .map(w => ({ id: w.id, name: w.part_name, amps: w.amp_draw, priority: w.priority }));

    const currentAmps = round1(onIt.reduce((s, m) => s + (m.amps || 0), 0));
    const plannedAmps = round1(plannedOnIt.reduce((s, w) => s + (w.amps || 0), 0));
    const totalAmps = round1(currentAmps + plannedAmps);

    // Unknown draw means we can't judge — say so rather than implying it's fine
    const unknown = [...onIt, ...plannedOnIt].some(x => x.amps == null);

    let status = 'ok';
    if (fuse) {
      if (totalAmps > fuse) status = 'over';
      else if (totalAmps > fuse * 0.8) status = 'tight';
    }

    return {
      switch_number: n,
      fuse_amps: fuse,
      label: slot.default_label,
      factory_used: !!slot.factory_used,
      reclaimed: !!slot.reclaimed,
      available: !slot.factory_used && onIt.length === 0,
      mods: onIt,
      planned: plannedOnIt,
      currentAmps, plannedAmps, totalAmps,
      unknownDraw: unknown,
      status,
      headroomAmps: fuse != null ? round1(fuse - totalAmps) : null,
    };
  });

  const usable = switches.filter(s => !s.factory_used);
  const summary = {
    total: switches.length,
    factoryUsed: switches.filter(s => s.factory_used).length,
    occupied: usable.filter(s => s.mods.length > 0).length,
    free: usable.filter(s => s.mods.length === 0 && s.planned.length === 0).length,
    spokenFor: usable.filter(s => s.mods.length === 0 && s.planned.length > 0).length,
    over: switches.filter(s => s.status === 'over').length,
    tight: switches.filter(s => s.status === 'tight').length,
  };

  // Wishlist items with a draw but no switch chosen yet — these need somewhere to go
  const unassigned = planned
    .filter(w => !w.aux_switch)
    .map(w => ({ id: w.id, name: w.part_name, amps: w.amp_draw, priority: w.priority }));

  res.json({ hasAux: true, switches, summary, unassigned });
});

module.exports = router;
