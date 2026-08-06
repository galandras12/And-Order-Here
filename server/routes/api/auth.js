const express = require('express');

const authService = require('../../services/authService');
const { requireAuth } = require('../../middleware');
const { restaurantRepository } = require('../../db/repositories');

const router = express.Router();

/** AuthError -> HTTP valasz. */
function sendAuthError(res, err, next) {
  if (err.name !== 'AuthError') {
    next(err);
    return;
  }
  if (err.retryAfterSeconds) {
    res.set('Retry-After', String(err.retryAfterSeconds));
  }
  res.status(err.status || 401).json({
    error: err.code,
    message: err.message,
    ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {})
  });
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Admin / logisztika / vezetoseg belepese.
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await authService.loginWithPassword(email, password, { rateLimitKey: req.ip });
    res.json(result);
  } catch (err) {
    sendAuthError(res, err, next);
  }
});

/**
 * POST /api/auth/login-pin
 * Body: { pinCode, restaurantId? }
 * Pincer / szakacs gyors belepese. Egy etterem eseten a restaurantId elhagyhato.
 */
router.post('/login-pin', async (req, res, next) => {
  try {
    const { pinCode, restaurantId } = req.body || {};
    const result = await authService.loginWithPin(pinCode, restaurantId, { rateLimitKey: req.ip });
    res.json(result);
  } catch (err) {
    sendAuthError(res, err, next);
  }
});

/**
 * POST /api/auth/logout
 * JWT eseten szerver oldalon nincs teendo: a kliens torli a tokent.
 * A vegpont azert letezik, hogy a kliens egysegesen jelezhesse a kilepest.
 */
router.post('/logout', (req, res) => {
  res.json(authService.logout());
});

/**
 * GET /api/auth/me
 * Az aktualis bejelentkezett felhasznalo adatai a token alapjan.
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/**
 * GET /api/auth/restaurants
 * Publikus, minimalis etterem lista a PIN-es bejelentkezo kepernyohoz
 * (tobb etterem eseten valaszthatova teszi, melyikbe lep be a dolgozo).
 */
router.get('/restaurants', (req, res) => {
  const restaurants = restaurantRepository.all().map((restaurant) => ({
    id: restaurant.id,
    name: restaurant.name
  }));
  res.json({ restaurants });
});

module.exports = router;
