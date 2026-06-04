require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Auto-initialize database on first run (creates tables + seeds vehicles)
const DATA_DIR_EARLY = process.env.DATA_DIR || './data';
const DB_PATH_EARLY = path.join(DATA_DIR_EARLY, 'raptortracker.db');
if (!fs.existsSync(DB_PATH_EARLY)) {
  console.log('First run detected — initializing database…');
  require('./server/db/init.js');
}

const { requireAuth, login, logout, me } = require('./server/middleware/auth');
const vehiclesRouter = require('./server/routes/vehicles');
const userVehiclesRouter = require('./server/routes/userVehicles');
const modsRouter = require('./server/routes/mods');
const maintenanceRouter = require('./server/routes/maintenance');
const uploadRouter = require('./server/routes/upload');
const summaryRouter = require('./server/routes/summary');
const exportRouter = require('./server/routes/export');
const vinRouter        = require('./server/routes/vin');
const modTransferRouter = require('./server/routes/modTransfer');
const vehicleTransferRouter = require('./server/routes/vehicleTransfer');
const { router: intervalsRouter } = require('./server/routes/intervals');
const wishlistRouter = require('./server/routes/wishlist');
const fuelRouter = require('./server/routes/fuel');
const warrantyRouter = require('./server/routes/warranty');
const tcoRouter = require('./server/routes/tco');
const notificationsRouter = require('./server/routes/notifications');
const tiresRouter = require('./server/routes/tires');
const recallsRouter = require('./server/routes/recalls');
const backupRouter = require('./server/routes/backup');
const logbookRouter = require('./server/routes/logbook');
const mileageRouter = require('./server/routes/mileage');
const analyticsRouter = require('./server/routes/analytics');
const scheduler = require('./server/scheduler');

const DATA_DIR = process.env.DATA_DIR || './data';
const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'raptortracker-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set to true when behind HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

// Auth endpoints (no requireAuth guard)
app.post('/api/auth/login', login);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me', me);

// All other API routes require auth
app.use('/api', requireAuth);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/user-vehicles', userVehiclesRouter);
app.use('/api/mods', modsRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/export', exportRouter);
app.use('/api/vin',    vinRouter);
app.use('/api/mods',  modTransferRouter);
app.use('/api/user-vehicles', vehicleTransferRouter);
app.use('/api/intervals', intervalsRouter);
app.use('/api/wishlist', wishlistRouter);
app.use('/api/fuel', fuelRouter);
app.use('/api/warranty', warrantyRouter);
app.use('/api/tco', tcoRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/tires', tiresRouter);
app.use('/api/recalls', recallsRouter);
app.use('/api/backup', backupRouter);
app.use('/api/logbook', logbookRouter);
app.use('/api/mileage', mileageRouter);
app.use('/api/analytics', analyticsRouter);

// Serve React frontend in production
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`RaptorTracker running on http://localhost:${PORT}`);
  scheduler.start();
});
