const express = require('express');

const { optionalAuth } = require('../../middleware');

const router = express.Router();

/**
 * Online rendelesi API - publikus felulet, bejelentkezes nelkul is elerheto.
 *
 * optionalAuth: ha van ervenyes token (pl. egy bejelentkezett dolgozo nyitja
 * meg), kitolti a req.user-t, de a hozzaferes belepes nelkul is megmarad.
 */
router.get('/status', optionalAuth, (req, res) => {
  res.json({
    interface: 'online',
    public: true,
    user: req.user || null,
    message: 'Online rendeles - publikus API, a funkciok kesobbi szegmensben keszulnek el.'
  });
});

module.exports = router;
