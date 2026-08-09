const express = require('express');

const router = express.Router();

/**
 * Logisztikai API. A router ele a /api/logistics mount rakja a requireAuth +
 * requireRole(['logistics']) vedelmet, igy itt mar biztos, hogy req.user logistics.
 *
 * A tenyleges funkciok (keszlet, beszerzes) kesobbi szegmensben
 * keszulnek el; egyelore csak a vedelmi struktura all fel.
 */
router.get('/status', (req, res) => {
  res.json({
    interface: 'logistics',
    user: req.user,
    message: 'Logisztikai API - a funkciok kesobbi szegmensben keszulnek el.'
  });
});

module.exports = router;
