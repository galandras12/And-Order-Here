const express = require('express');

const router = express.Router();

/**
 * Konyhai API. A router ele a /api/kitchen mount rakja a requireAuth +
 * requireRole(['cook']) vedelmet, igy itt mar biztos, hogy req.user cook.
 *
 * A tenyleges funkciok (etel keszites, tetel allapotok) kesobbi szegmensben
 * keszulnek el; egyelore csak a vedelmi struktura all fel.
 */
router.get('/status', (req, res) => {
  res.json({
    interface: 'kitchen',
    user: req.user,
    message: 'Konyhai API - a funkciok kesobbi szegmensben keszulnek el.'
  });
});

module.exports = router;
