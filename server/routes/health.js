const express = require('express');

const router = express.Router();

/**
 * GET /health - egyszeru allapotjelzo, amivel ellenorizheto, hogy a szerver fut.
 */
router.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router;
