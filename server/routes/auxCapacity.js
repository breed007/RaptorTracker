const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { computeCapacity } = require('../services/auxCapacity');

// GET /api/aux-capacity?vehicle_id=X
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const result = computeCapacity(getDb(), vehicle_id);
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json(result);
});

module.exports = router;
