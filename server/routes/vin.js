const express = require('express');
const { getDb } = require('../db');
const router = express.Router();

// VIN position 10 (0-indexed) encodes model year
const VIN_YEAR_MAP = {
  'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014,
  'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
  'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024,
  'S': 2025, 'T': 2026, 'V': 2027, 'W': 2028, 'X': 2029, 'Y': 2030,
};

// Valid VIN: 17 chars, no I O Q
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * GET /api/vin/:vin
 * Decode a VIN via NHTSA VPIC, match to a ref vehicle, return structured data.
 */
router.get('/:vin', async (req, res) => {
  const vin = req.params.vin.toUpperCase().trim();

  if (!VIN_RE.test(vin)) {
    return res.status(400).json({
      error: 'Invalid VIN — must be 17 characters, letters A–Z (no I, O, Q) and digits 0–9.'
    });
  }

  // Fallback year from VIN character 9 (pos 10, 0-indexed)
  const vinYearFallback = VIN_YEAR_MAP[vin[9]] || null;

  let nhtsaData = null;
  try {
    const nhtsaRes = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (nhtsaRes.ok) {
      nhtsaData = await nhtsaRes.json();
    }
  } catch (err) {
    // Network failure — fall through to VIN-only decode
    console.warn('NHTSA fetch failed:', err.message);
  }

  // Parse NHTSA results array into a flat map
  const nhtsa = {};
  if (nhtsaData?.Results) {
    for (const r of nhtsaData.Results) {
      if (r.Value && r.Value !== 'Not Applicable' && r.Value !== 'null') {
        nhtsa[r.Variable] = r.Value;
      }
    }
  }

  const year     = parseInt(nhtsa['Model Year'])  || vinYearFallback;
  const make     = nhtsa['Make']                  || null;
  const model    = nhtsa['Model']                 || null;
  const series   = nhtsa['Series']                || null;
  const trim     = nhtsa['Trim']                  || null;
  const bodyClass = nhtsa['Body Class']           || null;
  const engCyl   = nhtsa['Engine Number of Cylinders'] || null;
  const engDisp  = nhtsa['Displacement (L)']      || null;
  const engModel = nhtsa['Engine Model']          || null;
  const fuelType = nhtsa['Fuel Type - Primary']   || null;
  const turbo    = nhtsa['Turbo']                 || null;
  const errorCode = nhtsa['Error Code']           || null;
  const errorText = (errorCode && errorCode !== '0') ? (nhtsa['Error Text'] || null) : null;

  // Build a readable engine description
  let engineDesc = null;
  if (engDisp || engCyl || engModel) {
    const parts = [];
    if (engDisp) parts.push(`${parseFloat(engDisp).toFixed(1)}L`);
    if (engCyl)  parts.push(`V${engCyl}`);
    if (turbo && /yes/i.test(turbo)) parts.push('EcoBoost');
    if (fuelType && !/gasoline/i.test(fuelType)) parts.push(`(${fuelType})`);
    engineDesc = parts.join(' ');
    if (engModel && !parts.some(p => engModel.includes(p.replace('L','')))) {
      engineDesc += ` — ${engModel}`;
    }
  }

  // Match to a ref vehicle in our DB
  let generation  = null;
  let refVehicleId = null;

  try {
    const db = getDb();
    const refVehicles = db.prepare('SELECT * FROM vehicles').all();

    if (year && make && model) {
      const makeUp  = make.toUpperCase();
      const modelUp = model.toUpperCase();

      // Only attempt match for Ford
      if (makeUp.includes('FORD')) {
        // Narrow candidates by model name
        let candidates = refVehicles.filter(v => {
          const vm = v.model.toUpperCase();
          if (modelUp.includes('BRONCO') && vm.includes('BRONCO')) return true;
          if (modelUp.includes('RANGER') && vm.includes('RANGER')) return true;
          if ((modelUp.includes('F-150') || modelUp.includes('F150')) &&
              !vm.includes('BRONCO') && !vm.includes('RANGER')) return true;
          return false;
        });
        if (candidates.length === 0) candidates = refVehicles;

        // Match by model year range
        const matched = candidates.find(v =>
          year >= v.model_year_start &&
          (v.model_year_end === null || year <= v.model_year_end)
        );
        if (matched) {
          generation   = matched.generation;
          refVehicleId = matched.id;
        }
      }
    }
  } catch (dbErr) {
    console.error('VIN DB match error:', dbErr);
  }

  const isFord = make ? make.toUpperCase().includes('FORD') : vin.startsWith('1FT') || vin.startsWith('2FT');

  res.json({
    vin,
    year,
    make,
    model,
    series,
    trim,
    bodyClass,
    engineDesc,
    fuelType,
    generation,
    refVehicleId,
    isFord,
    windowStickerUrl: `https://www.windowsticker.forddirect.com/windowsticker.pdf?vin=${vin}`,
    errorText,
    nhtsaAvailable: !!nhtsaData,
  });
});

module.exports = router;
