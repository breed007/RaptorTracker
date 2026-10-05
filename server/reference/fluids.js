/**
 * Fluids, capacities, and service parts for each Raptor generation.
 *
 * Every figure is copied from the "Capacities and Specifications" chapter of
 * Ford's free owner's manual (or Raptor supplement) for the model year cited,
 * as Ford printed it, including Ford's own unit conversions. Values a manual
 * left out are left out here rather than filled in from memory or forums: the
 * Gen 3 manual lists no transmission fluid, the Gen 1 supplement has no wheel
 * nut torque, and so on.
 *
 * This is a short list of facts with the source named, not a copy of the
 * manual. Owners copy lines into their own spec sheet, where they can edit
 * them; this data stays as Ford published it.
 */

const MANUALS = 'https://www.fordservicecontent.com/Ford_Content/Catalog/owner_information/';

const FLUIDS = {
  'F-150 Raptor|Gen 1': {
    source: { title: '2014 F-150 SVT Raptor Supplement', url: `${MANUALS}2014-F-150-SVT-Raptor-Supplement-First-Print_rp_en-us_09_2013.pdf` },
    note: 'For the 6.2L V8. Early 2010–2011 trucks with the 5.4L V8 use different figures; check that year’s manual.',
    groups: [{
      items: [
        { category: 'fluids', name: 'Engine oil', value: '7.0 qt (6.6 L) with filter, SAE 5W-20', spec: 'Motorcraft XO-5W20-QSP · WSS-M2C945-A' },
        { category: 'fluids', name: 'Engine coolant', value: '16.9 qt (16.0 L), Motorcraft Orange prediluted', spec: 'VC-3DIL-B · WSS-M97B44-D2' },
        { category: 'fluids', name: 'Front axle', value: '3.6 pt (1.7 L), SAE 80W-90', spec: 'XY-80W90-QL · WSP-M2C197-A. For a complete refill of a Torsen front axle, add 4 fl oz (118 ml) of friction modifier XL-3.' },
        { category: 'fluids', name: 'Rear axle', value: '5.5 pt (2.6 L), SAE 75W-85 synthetic', spec: 'XY-75W85-QL · WSS-M2C942-A. Do not add friction modifier to the rear axle.' },
        { category: 'fluids', name: 'Automatic transmission', value: '13.1 qt (12.4 L) approximate dry fill, MERCON LV', spec: 'Set the level by the dipstick.' },
        { category: 'fluids', name: 'Transfer case', value: '2.9–3.1 pt (1.4–1.5 L), Motorcraft Transfer Case Fluid', spec: 'XL-12 · ESP-M2C166-H' },
        { category: 'capacities', name: 'Fuel tank', value: 'SuperCab 26 gal (98.4 L); SuperCrew 36 gal (136.3 L)' },
        { category: 'parts', name: 'Oil filter', value: 'FL-820S' },
        { category: 'parts', name: 'Air filter', value: 'FA-1883' },
        { category: 'parts', name: 'Battery', value: 'BTX-59, or BTX-65-650 heavy-duty if equipped' },
      ],
    }],
  },

  'F-150 Raptor|Gen 2': {
    source: { title: '2019 F-150 Raptor Supplement (wheel nuts: 2019 F-150 Owner’s Manual)', url: `${MANUALS}2019-Ford-F-150-Raptor-Supplement-version-1_su_EN-US_10_2018.pdf` },
    groups: [{
      items: [
        { category: 'fluids', name: 'Engine oil', value: '6.0 qt (5.7 L) with filter, SAE 5W-30', spec: 'Motorcraft XO-5W30-QSP · WSS-M2C946-A' },
        { category: 'fluids', name: 'Engine coolant', value: '15.16 qt (14.35 L), Motorcraft Orange prediluted', spec: 'VC-3DIL-B · WSS-M97B44-D2' },
        { category: 'fluids', name: 'Front axle', value: '1.8 qt (1.7 L), SAE 75W-85 synthetic', spec: 'XY-75W85-QL · WSS-M2C942-A' },
        { category: 'fluids', name: 'Rear axle', value: '2.7 qt (2.6 L), SAE 75W-85 synthetic', spec: 'XY-75W85-QL · WSS-M2C942-A' },
        { category: 'fluids', name: 'Automatic transmission', value: '14.1 qt (13.3 L) approximate dry fill, MERCON ULV', spec: 'WSS-M2C949-A' },
        { category: 'fluids', name: 'Transfer case (Torque On Demand)', value: '1.5 qt (1.4 L), MERCON LV', spec: 'XT-10-QLVC · WSS-M2C938-A' },
        { category: 'fluids', name: 'Brake fluid', value: 'DOT 4 Low Viscosity, between MIN and MAX', spec: 'PM-20 · WSS-M6C65-A2' },
        { category: 'capacities', name: 'Fuel tank', value: 'SuperCab 26.0 gal (98.4 L); crew cab 36.0 gal (136.2 L)' },
        { category: 'torque', name: 'Wheel nuts', value: '150 lb.ft (204 Nm), M14 x 1.5', spec: 'Retighten within 100 mi (160 km) after any wheel removal.' },
        { category: 'parts', name: 'Oil filter', value: 'FL-500-S' },
        { category: 'parts', name: 'Air filter', value: 'FA-1883' },
        { category: 'parts', name: 'Cabin air filter', value: 'FP-79' },
        { category: 'parts', name: 'Transmission filter', value: 'FT-188' },
        { category: 'parts', name: 'Spark plugs', value: 'SP-534, gap 0.030–0.033 in (0.75–0.85 mm)' },
        { category: 'parts', name: 'Battery', value: 'BAGM-94RH7-800' },
      ],
    }],
  },

  'F-150 Raptor|Gen 3': {
    source: { title: '2022 F-150 Owner’s Manual (Raptor sections)', url: `${MANUALS}2022-Ford-F-150-Owners-Manual-version-1_om_EN-US_10_2021.pdf` },
    note: 'For the 3.5L EcoBoost Raptor. Raptor R figures are listed under Gen 3.5.',
    groups: [{
      items: [
        { category: 'fluids', name: 'Engine oil', value: '6.0 qt (5.7 L) with filter, SAE 5W-30', spec: 'Motorcraft XO-5W30-Q1SP · WSS-M2C961-A1' },
        { category: 'fluids', name: 'Engine coolant', value: '13.7 qt (13 L), Motorcraft Yellow prediluted', spec: 'VC-13DL-G · WSS-M97B57-A2' },
        { category: 'fluids', name: 'Front axle', value: 'Standard axle 1.8 qt (1.7 L); Torsen limited-slip 1.64 qt (1.55 L), SAE 75W-85 synthetic', spec: 'XY-75W85-QL · WSS-M2C942-A. A Torsen refill includes 4.0 fl oz (118.5 ml) of friction modifier XL-3.' },
        { category: 'fluids', name: 'Rear axle (9.75 in)', value: '2.5–2.6 qt (2.36–2.44 L), SAE 75W-85 synthetic', spec: 'XY-75W85-QL · WSS-M2C942-A' },
        { category: 'fluids', name: 'Transfer case', value: '1.9 qt (1.8 L), MERCON LV', spec: 'XT-10-QLVC · WSS-M2C938-A' },
        { category: 'fluids', name: 'Brake fluid', value: 'DOT 4 Low Viscosity High Performance, fill as required', spec: 'PM-20 · WSS-M6C65-A2' },
        { category: 'capacities', name: 'Fuel tank', value: '36.0 gal (136.3 L)' },
        { category: 'torque', name: 'Wheel nuts', value: '150 lb.ft (204 Nm), M14 x 1.5', spec: 'Retighten within 100 mi (160 km) after any wheel removal.' },
        { category: 'parts', name: 'Oil filter', value: 'FL-500-S' },
        { category: 'parts', name: 'Air filter', value: 'FA-1883' },
        { category: 'parts', name: 'Cabin air filter', value: 'FP-92' },
        { category: 'parts', name: 'Spark plugs', value: 'SP-596' },
        { category: 'parts', name: 'Battery', value: 'BAGM-94RH7-800' },
      ],
    }],
  },

  'F-150 Raptor|Gen 3.5': {
    source: { title: '2024 F-150 Owner’s Manual (3.5L Raptor and 5.2L sections)', url: `${MANUALS}2024_Ford_F-150_Owners_Manual_version_1_om_EN-US.pdf` },
    groups: [
      {
        title: 'Raptor (3.5L EcoBoost)',
        items: [
          { category: 'fluids', name: 'Engine oil', value: '6.0 qt (5.7 L) with filter, SAE 5W-30', spec: 'Motorcraft XO-5W30-Q1SP · WSS-M2C961-A1' },
          { category: 'fluids', name: 'Engine coolant', value: '13.4 qt (12.7 L), Motorcraft Yellow prediluted', spec: 'VC-13DL-G · WSS-M97B57-A2' },
          { category: 'fluids', name: 'Rear axle (9.75 in)', value: '2.5–2.6 qt (2.36–2.44 L), SAE 75W-85 synthetic', spec: 'XY-75W85-QL · WSS-M2C942-A' },
          { category: 'fluids', name: 'Transfer case', value: '1.9 qt (1.8 L), MERCON LV', spec: 'XT-10-QLVC · WSS-M2C938-A' },
          { category: 'fluids', name: 'Automatic transmission', value: 'MERCON ULV (the manual gives no capacity)', spec: 'XT-12-QULV' },
          { category: 'torque', name: 'Wheel nuts', value: '150 lb.ft (204 Nm), M14 x 1.5', spec: 'Retighten within 100 mi (160 km) after any wheel removal.' },
          { category: 'parts', name: 'Oil filter', value: 'FL-500-S' },
          { category: 'parts', name: 'Air filter', value: 'FA-1883' },
          { category: 'parts', name: 'Cabin air filter', value: 'FP-92' },
          { category: 'parts', name: 'Spark plugs', value: 'SP-596' },
          { category: 'parts', name: 'Battery', value: 'BAGM-94RH7-800' },
        ],
      },
      {
        title: 'Raptor R (5.2L supercharged V8)',
        items: [
          { category: 'fluids', name: 'Engine oil', value: '11.5 qt (10.88 L), SAE 5W-50 full synthetic', spec: 'Motorcraft XO-5W50-QGT · WSS-M2C931-E1' },
          { category: 'fluids', name: 'Engine coolant', value: 'High-temperature loop 12.7 qt (12 L); low-temperature loop 3.28 qt (3.1 L), Motorcraft Yellow prediluted', spec: 'VC-13DL-G · WSS-M97B57-A2' },
          { category: 'parts', name: 'Oil filter', value: 'FL-500-S', spec: 'Ford warns that any other filter could cause engine damage.' },
          { category: 'parts', name: 'Air filter', value: 'FA-1922' },
          { category: 'parts', name: 'Cabin air filter', value: 'FP-92' },
          { category: 'parts', name: 'Transmission filter', value: 'FT-202' },
          { category: 'parts', name: 'Spark plugs', value: 'SP-581-X, gap 0.037 ± 0.002 in (0.95 ± 0.05 mm)' },
          { category: 'parts', name: 'Battery', value: 'BAGM-94RH7-800' },
        ],
      },
    ],
  },

  'Bronco Raptor|Gen 1': {
    source: { title: '2024 Bronco Owner’s Manual (3.0L and Raptor sections)', url: `${MANUALS}2024_Ford_Bronco_Owners_Manual_version_1_om_EN-US.pdf` },
    groups: [{
      items: [
        { category: 'fluids', name: 'Engine oil', value: '7.0 qt (6.62 L) with filter, SAE 5W-30', spec: 'Motorcraft XO-5W30-Q1SP · WSS-M2C961-A1' },
        { category: 'fluids', name: 'Engine coolant', value: '12.4 qt (11.7 L), Motorcraft Yellow prediluted', spec: 'VC-13DL-G · WSS-M97B57-A2' },
        { category: 'fluids', name: 'Front axle (Raptor, locking)', value: '28.7 fl oz (850 ml), SAE 75W-85 synthetic', spec: 'XY-75W85-QL · WSS-M2C942-A' },
        { category: 'fluids', name: 'Rear axle (locking)', value: '63.6 fl oz (1.88 L), SAE 75W-85 synthetic', spec: 'XY-75W85-QL · WSS-M2C942-A' },
        { category: 'fluids', name: 'Transfer case (advanced 4x4 with 4A)', value: '1.6 qt (1.55 L), MERCON LV', spec: 'XT-10-QLVC · WSS-M2C938-A' },
        { category: 'fluids', name: 'Automatic transmission', value: 'MERCON ULV (the manual gives no capacity)', spec: 'XT-12-QULV' },
        { category: 'capacities', name: 'Fuel tank', value: 'Four-door (long wheelbase) 21.1 gal (80 L)' },
        { category: 'torque', name: 'Wheel nuts (Raptor)', value: '150 lb.ft (204 Nm), M14 x 1.5', spec: 'Retighten within 100 mi (160 km) after any wheel removal.' },
        { category: 'parts', name: 'Oil filter', value: 'FL-2062-A' },
        { category: 'parts', name: 'Air filter', value: 'FA-2058' },
        { category: 'parts', name: 'Cabin air filter', value: 'FP-93' },
        { category: 'parts', name: 'Transmission filter', value: 'FT-218' },
        { category: 'parts', name: 'Spark plugs', value: 'SP-594' },
        { category: 'parts', name: 'Battery', value: 'BAGM-94RH7-800' },
      ],
    }],
  },

  'Ranger Raptor|Gen 1 (NA)': {
    source: { title: '2024 Ranger Owner’s Manual (3.0L and Raptor sections)', url: `${MANUALS}2024_P703_Ranger_TRD_OM_ENG.pdf` },
    groups: [{
      items: [
        { category: 'fluids', name: 'Engine oil', value: '7.0 qt (6.62 L) with filter, SAE 5W-30', spec: 'Motorcraft XO-5W30-Q1SP · WSS-M2C961-A1' },
        { category: 'fluids', name: 'Engine coolant', value: '12.4 qt (11.7 L), Motorcraft Yellow prediluted', spec: 'VC-13DL-G · WSS-M97B57-A2' },
        { category: 'fluids', name: 'Front axle (locking)', value: '26.2 ± 0.8 fl oz (775 ± 25 ml), SAE 75W-85 synthetic', spec: 'XY-75W85-QL · WSS-M2C942-A' },
        { category: 'fluids', name: 'Rear axle (Raptor locking)', value: '80 fl oz (2.35 L), SAE 75W-85 synthetic', spec: 'XY-75W85-QL · WSS-M2C942-A' },
        { category: 'fluids', name: 'Transfer case (automatic 4WD)', value: '1.6 qt (1.55 L), MERCON LV', spec: 'XT-10-QLVC · WSS-M2C938-A' },
        { category: 'capacities', name: 'Fuel tank (3.0L)', value: '20.34 gal (77 L)' },
        { category: 'torque', name: 'Wheel nuts', value: '100 lb.ft (135 Nm), M12 x 1.5', spec: 'Retighten within 100 mi (160 km) after any wheel removal.' },
        { category: 'parts', name: 'Oil filter', value: 'FL-2062-A' },
        { category: 'parts', name: 'Air filter', value: 'FA-2058' },
        { category: 'parts', name: 'Cabin air filter', value: 'FP-93' },
        { category: 'parts', name: 'Transmission filter', value: 'FT-202' },
        { category: 'parts', name: 'Spark plugs', value: 'SP-594' },
        { category: 'parts', name: 'Battery', value: 'BAGM-94RH7-800' },
      ],
    }],
  },
};

function fluidsFor(model, generation) {
  return FLUIDS[`${model}|${generation}`] || null;
}

module.exports = { FLUIDS, fluidsFor };
