/**
 * Reference data for each Raptor generation, owned by the code rather than
 * the owner. syncReferenceVehicles() runs on every start, so a correction
 * here reaches existing installs the way AUX layout corrections do; the
 * owner's own vehicles are never touched.
 *
 * horsepower / torque are the standard engine for the generation. Other
 * engines (the Raptor R's supercharged V8, Gen 1's early 5.4L) are listed in
 * engine_options. Figures are Ford's published ratings.
 */
const REFERENCE_VEHICLES = [
  {
    make: 'Ford',
    model: 'F-150 Raptor',
    generation: 'Gen 1',
    variant: 'SVT Raptor',
    model_year_start: 2010,
    model_year_end: 2014,
    engine_options: [
      { name: '5.4L V8', displacement: '5.4L', cylinders: 'V8', years: '2010–2011', hp: 310, torque: 365 },
      { name: '6.2L V8', displacement: '6.2L', cylinders: 'V8', years: '2010–2014', hp: 411, torque: 434 }
    ],
    horsepower: 411,
    torque: 434,
    suspension_notes: 'Fox Racing internal-bypass shocks',
    tire_size: '315/70R17 BFG All-Terrain',
    notes: 'First generation. SuperCab 2010 only, SuperCrew added 2011. SVT (Special Vehicle Team) prefix used on all Gen 1 models. No overhead AUX switch panel.'
  },
  {
    make: 'Ford',
    model: 'F-150 Raptor',
    generation: 'Gen 2',
    variant: null,
    model_year_start: 2017,
    model_year_end: 2020,
    engine_options: [
      { name: '3.5L EcoBoost V6 Twin-Turbo', displacement: '3.5L', cylinders: 'V6', years: '2017–2020', hp: 450, torque: 510, induction: 'Twin-Turbo' }
    ],
    horsepower: 450,
    torque: 510,
    suspension_notes: 'Fox Racing 3.0 internal-bypass shocks with external reservoirs. Live Valve shocks added for 2019 model year.',
    tire_size: '315/70R17 BFG KO2',
    notes: 'Dropped V8 vs Gen 1. Aluminum body. First gen with AUX switch overhead panel. 10-speed SelectShift automatic transmission.'
  },
  {
    make: 'Ford',
    model: 'F-150 Raptor',
    generation: 'Gen 3',
    variant: null,
    model_year_start: 2021,
    model_year_end: 2023,
    engine_options: [
      { name: '3.5L High-Output EcoBoost V6', displacement: '3.5L', cylinders: 'V6', years: '2021–2023', hp: 450, torque: 510, induction: 'Twin-Turbo', notes: 'Base engine' },
      { name: '5.2L Carnivore Supercharged V8', displacement: '5.2L', cylinders: 'V8', years: '2023', hp: 700, torque: 640, induction: 'Supercharged', notes: 'Raptor R variant' }
    ],
    horsepower: 450,
    torque: 510,
    suspension_notes: 'Fox Live Valve. Rear suspension switched from leaf springs to coil-spring 5-link with Panhard bar — major change vs Gen 2.',
    tire_size: '35" standard; 37" available (Raptor 37 package)',
    notes: 'Raptor R variant added for the 2023 model year with the 5.2L supercharged V8 (700 hp, 640 lb-ft). First gen with coil rear suspension. 10-speed SelectShift automatic.'
  },
  {
    make: 'Ford',
    model: 'F-150 Raptor',
    generation: 'Gen 3.5',
    variant: null,
    model_year_start: 2024,
    model_year_end: null,
    engine_options: [
      { name: '3.5L High-Output EcoBoost V6', displacement: '3.5L', cylinders: 'V6', years: '2024–present', hp: 450, torque: 510, induction: 'Twin-Turbo', notes: 'Base engine' },
      { name: '5.2L Carnivore Supercharged V8', displacement: '5.2L', cylinders: 'V8', years: '2024–present', hp: 720, torque: 640, induction: 'Supercharged', notes: 'Raptor R variant' }
    ],
    horsepower: 450,
    torque: 510,
    suspension_notes: 'FOX Dual Live Valve — position-sensitive compression control and continuously variable rebound, front and rear tuned separately. Significant upgrade over Gen 3 Live Valve.',
    tire_size: '35" standard; 37" available',
    notes: 'Mid-cycle refresh of Gen 3. HUD added. Raptor R bumped to 720hp for 2024. Wire color codes changed in 2024 vs Gen 3. AUX 1 factory-consumed by bumper fogs — see AUX panel for details. AUX 3 bumped to 15A (was 10A on Gen 2/3).'
  },
  {
    make: 'Ford',
    model: 'Bronco Raptor',
    generation: 'Gen 1',
    variant: null,
    model_year_start: 2022,
    model_year_end: null,
    engine_options: [
      { name: '3.0L EcoBoost V6 Twin-Turbo', displacement: '3.0L', cylinders: 'V6', years: '2022–present', hp: 418, torque: 440, induction: 'Twin-Turbo' }
    ],
    horsepower: 418,
    torque: 440,
    suspension_notes: 'HOSS 4.0 system — FOX Live Valve 3.1 internal bypass semi-active dampers. 13" front / 14" rear wheel travel. Front and rear tuned independently.',
    tire_size: '37" all-terrain (17" wheels)',
    notes: '4-door SUV body. Removable doors and roof panels. True dual exhaust with 4 selectable modes (Normal, Sport, Quiet, Baja). Integrated Rigid LED fog lamps standard. Extended wheelbase vs standard Bronco (+8.6 inches). Semi-float Dana 50 rear, Dana 44 AdvanTEK front. 3.06:1 4LO ratio, up to 67.7:1 crawl ratio. G.O.A.T. modes including Baja mode. AUX switch architecture differs from F-150 Raptor.'
  },
  {
    make: 'Ford',
    model: 'Ranger Raptor',
    generation: 'Gen 1 (NA)',
    variant: null,
    model_year_start: 2024,
    model_year_end: null,
    engine_options: [
      { name: '3.0L EcoBoost V6 Twin-Turbo', displacement: '3.0L', cylinders: 'V6', years: '2024–present', hp: 405, torque: 430, induction: 'Twin-Turbo' }
    ],
    horsepower: 405,
    torque: 430,
    suspension_notes: 'Fox 2.5 Live Valve internal bypass shocks',
    tire_size: '33" BFG KO2 (17" wheels)',
    notes: 'Mid-size sibling to F-150 Raptor. North America debut 2024 (global market since 2019). Trail Control and Trail 1-Pedal Drive standard. HUD added for 2024 refresh. 10-speed SelectShift automatic.'
  }
];

const SYNCED = ['variant', 'model_year_start', 'model_year_end', 'engine_options', 'horsepower', 'torque', 'suspension_notes', 'tire_size', 'notes'];

function syncReferenceVehicles(db) {
  const find = db.prepare('SELECT id FROM vehicles WHERE make = ? AND model = ? AND generation = ?');
  const update = db.prepare(`UPDATE vehicles SET ${SYNCED.map(c => `${c} = @${c}`).join(', ')} WHERE id = @id`);
  for (const v of REFERENCE_VEHICLES) {
    const row = find.get(v.make, v.model, v.generation);
    if (!row) continue;
    update.run({ ...Object.fromEntries(SYNCED.map(c => [c, v[c] ?? null])), engine_options: JSON.stringify(v.engine_options), id: row.id });
  }
}

module.exports = { REFERENCE_VEHICLES, syncReferenceVehicles };
