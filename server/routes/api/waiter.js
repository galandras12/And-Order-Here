const express = require('express');

const router = express.Router();

/**
 * Pinceri API. A router ele a /api/waiter mount rakja a requireAuth +
 * requireRole(['waiter']) vedelmet, igy itt mar biztos, hogy req.user pincer.
 *
 * A tenyleges funkciok (asztalterkep, rendelesfelvetel) kesobbi szegmensben
 * keszulnek el; egyelore csak a vedelmi struktura all fel.
 */
router.get('/status', (req, res) => {
  res.json({
    interface: 'waiter',
    user: req.user,
    message: 'Pinceri API - a funkciok kesobbi szegmensben keszulnek el.'
  });
});

module.exports = router;
