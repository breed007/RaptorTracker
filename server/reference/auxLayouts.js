/**
 * Factory AUX switch layouts — the defaults every truck starts from.
 *
 * Each rating here traces to a source named next to it, checked against
 * Ford's published owner's manuals and supplements in October 2026. These are
 * defaults, not law: an owner can override any switch's fuse rating on the
 * AUX panel (stored per vehicle), because trucks get rewired and Ford's
 * documents disagree with themselves now and then (see Gen 1, 2010).
 *
 * This module is the source of truth. On every start the reference rows in
 * the database are synced from it, so a corrected value ships with a release
 * instead of needing a migration, and owners' overrides are never touched.
 *
 * fuse_amps_by_year lets one model year differ from the rest of its
 * generation without a separate generation entry.
 */

const available = (n, amps, extra = {}) => ({
  switch_number: n, fuse_amps: amps, default_label: 'User Available', factory_used: false, warning_note: null, ...extra,
});

const AUX_LAYOUTS = [
  {
    model: 'F-150 Raptor', generation: 'Gen 1',
    // Ford prints 30/30/15/10 for 2011, 2012, 2013, and 2014. The 2010
    // supplement prints AUX 3 and AUX 4 the other way round (10 A / 15 A);
    // whether that was a wiring change or a misprint, a 2010 truck starts from
    // what its own book says and the owner can correct it.
    source: 'Ford F-150 SVT Raptor owner\'s guide supplements, 2010–2014 ("Upfitter Controls" / "Auxiliary Switches").',
    confidence: 'ford',
    switches: [
      available(1, 30),
      available(2, 30),
      available(3, 15, { fuse_amps_by_year: { 2010: 10 } }),
      available(4, 10, { fuse_amps_by_year: { 2010: 15 } }),
    ],
  },
  {
    model: 'F-150 Raptor', generation: 'Gen 2',
    source: 'Ford 2018 F-150 owner\'s manual supplement, "Accessories – Auxiliary Switches" (six-switch overhead panel).',
    confidence: 'ford',
    // Ford describes all six as prewired "for connection of electrical
    // accessories"; none is reserved for a factory feature.
    switches: [available(1, 15), available(2, 15), available(3, 10), available(4, 10), available(5, 5), available(6, 5)],
  },
  {
    model: 'F-150 Raptor', generation: 'Gen 3',
    source: 'Ford 2021 and 2022 F-150 owner\'s manuals, "Auxiliary Switches – Raptor/Tremor – Identifying the Auxiliary Switch Wiring".',
    confidence: 'ford',
    switches: [available(1, 10), available(2, 15), available(3, 15), available(4, 10), available(5, 5), available(6, 5)],
  },
  {
    model: 'F-150 Raptor', generation: 'Gen 3.5',
    // Ford's 2024 manual no longer prints the wiring table. These match the
    // 2021–2022 Ford table and were confirmed by a FordRaptorForum supporting
    // vendor who traced each circuit on customer trucks.
    source: 'Ford no longer publishes these for 2024+. Values traced on customer trucks by a FordRaptorForum supporting vendor; they match Ford\'s 2021–2022 table.',
    confidence: 'community',
    switches: [
      available(1, 10, {
        default_label: 'Bumper Fogs (Pair 2, Blacked-Out)',
        factory_used: true,
        warning_note: 'Factory wired to the second pair of bumper fogs (the blacked-out covers). Ford consumes this wire. ' +
          'Reclaiming AUX 1 needs a fog light splitter and relocation harness (for example, the SPV Parts relocation kit).',
      }),
      available(2, 15), available(3, 15), available(4, 10), available(5, 5), available(6, 5),
    ],
  },
  {
    model: 'Bronco Raptor', generation: 'Gen 1',
    source: 'Ford 2023 Bronco owner\'s manual, "Auxiliary Switches (If Equipped) – Identifying the Auxiliary Switch Wiring – Raptor".',
    confidence: 'ford',
    switches: [
      available(1, 10, {
        default_label: 'Off-Road Lights (if equipped)',
        warning_note: 'Ford wires AUX 1 to the factory off-road driving lights on trucks that have them. ' +
          'Check whether yours does before putting anything else on it.',
      }),
      available(2, 15), available(3, 30), available(4, 10), available(5, 10), available(6, 10),
    ],
  },
  {
    model: 'Ranger Raptor', generation: 'Gen 1 (NA)',
    source: 'Ford 2024 Ranger owner\'s manual (US), "Raptor – Identifying the Auxiliary Switch Wiring"; the 2022 Australian Ranger manual matches.',
    confidence: 'ford',
    switches: [
      available(1, 5), available(2, 15), available(3, 15), available(4, 15),
      // Ford labels these relays "(Driving lamps)": heavier 25 A circuits
      // intended for driving lights. Not consumed from the factory.
      available(5, 25, { default_label: 'Driving Lamp Circuit' }),
      available(6, 25, { default_label: 'Driving Lamp Circuit' }),
    ],
  },
];

function layoutFor(model, generation) {
  return AUX_LAYOUTS.find(l => l.model === model && l.generation === generation) || null;
}

/** Sync the reference vehicles' AUX data from this module. Idempotent. */
function syncReferenceAux(db) {
  const update = db.prepare(`
    UPDATE vehicles SET aux_switch_layout = ?, aux_switch_count = ?, aux_source = ?, aux_source_confidence = ?
    WHERE model = ? AND generation = ?`);
  for (const l of AUX_LAYOUTS) {
    update.run(JSON.stringify(l.switches), l.switches.length, l.source, l.confidence, l.model, l.generation);
  }
}

module.exports = { AUX_LAYOUTS, layoutFor, syncReferenceAux };
