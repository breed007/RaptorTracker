const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { buildSheet, DEFAULTS } = require('../services/buildSheet');

const asBool = (v, dflt) => (v === undefined ? dflt : v === 'true' || v === true);

// GET /api/share/build-sheet?vehicle_id=X&format=bbcode|markdown|text
router.get('/build-sheet', (req, res) => {
  const { vehicle_id, format } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  const options = {
    includeCosts:       asBool(req.query.costs,        DEFAULTS.includeCosts),
    includeMileage:     asBool(req.query.mileage,      DEFAULTS.includeMileage),
    includePartNumbers: asBool(req.query.part_numbers, DEFAULTS.includePartNumbers),
    includeAux:         asBool(req.query.aux,          DEFAULTS.includeAux),
    includeLinks:       asBool(req.query.links,        false),
    includeAttribution: asBool(req.query.attribution,  DEFAULTS.includeAttribution),
  };

  const sheet = buildSheet(getDb(), vehicle_id, format, options);
  if (!sheet) return res.status(404).json({ error: 'Not found' });
  res.json(sheet);
});

module.exports = router;
