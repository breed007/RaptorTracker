const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const sample = require('../services/sampleTruck');
const trash = require('../services/trash');

// POST /api/sample — add the sample truck (one at a time).
router.post('/', (req, res) => {
  const db = getDb();
  const existing = sample.sampleIds(db);
  if (existing.length) return res.json({ ok: true, id: existing[0], existing: true });
  res.json({ ok: true, id: sample.createSample(db) });
});

// DELETE /api/sample — remove the sample truck. It goes to the trash like any
// vehicle, in case records were added to it by mistake.
router.delete('/', (req, res) => {
  const db = getDb();
  const removed = sample.sampleIds(db).map(id => trash.moveToTrash(db, 'user_vehicles', id, { kind: 'Sample truck', title: sample.NICKNAME }));
  res.json({ ok: true, removed: removed.length });
});

module.exports = router;
