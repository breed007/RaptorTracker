/**
 * The AUX layout one particular truck actually has: Ford's default for its
 * generation and model year, then the owner's own fuse ratings, reclaimed
 * factory switches, and dismissed warnings layered on top.
 *
 * One function, used by both the vehicle API and the capacity planner — they
 * used to carry two hand-synced copies of this logic.
 */
const { jsonList, jsonObject } = require('../lib/json');

const MIN_AMPS = 1;
const MAX_AMPS = 60;

function effectiveLayout(row) {
  const layout = jsonList(row.aux_switch_layout);
  const dismissed = jsonList(row.dismissed_aux_warnings);
  const reclaimed = jsonList(row.reclaimed_aux_switches);
  const overrides = jsonObject(row.aux_fuse_overrides);
  const year = row.model_year != null ? String(row.model_year) : null;

  return layout.map(({ fuse_amps_by_year, ...slot }) => {
    const fordAmps = (year && fuse_amps_by_year && fuse_amps_by_year[year] != null) ? fuse_amps_by_year[year] : slot.fuse_amps;
    const own = overrides[String(slot.switch_number)];
    const out = {
      ...slot,
      fuse_amps: own != null ? Number(own) : fordAmps,
      fuse_amps_default: fordAmps,
      fuse_overridden: own != null,
    };
    if (reclaimed.includes(slot.switch_number)) {
      return { ...out, factory_used: false, warning_note: null, default_label: 'User Available', reclaimed: true };
    }
    if (dismissed.includes(slot.switch_number)) return { ...out, warning_note: null };
    return out;
  });
}

module.exports = { effectiveLayout, MIN_AMPS, MAX_AMPS };
