const express = require('express');

const menuService = require('../../services/menuService');
const orderService = require('../../services/orderService');
const { restaurantRepository } = require('../../db/repositories');
const { optionalAuth } = require('../../middleware');
const { NotFoundError } = require('../../utils/validation');
const { RateLimiter } = require('../../utils/rateLimiter');
const { ALLERGENS } = require('../../../shared/constants');

const router = express.Router();

/**
 * Online rendelesi API - publikus felulet, bejelentkezes nelkul is elerheto.
 *
 * Ezek a vegpontok szandekosan szuk kepet adnak: csak az etlap olvashato es
 * rendeles adhato le. Az etterem alapadataibol is csak az jon ki, ami a
 * vendegnek szol (nev, cim, telefon) - az AFA kulcs, a szervizdij es az AP kod
 * nem.
 *
 * optionalAuth: ha van ervenyes token (pl. egy bejelentkezett dolgozo nyitja
 * meg), kitolti a req.user-t, de a hozzaferes belepes nelkul is megmarad.
 */

/**
 * Publikus, bejelentkezes nelkuli iras: korlatozzuk, hogy egy kliens ne tudja
 * elarasztani a konyhat. Egyetlen folyamaton belul, memoriaban - ugyanaz a
 * korlatozo, mint a bejelentkezesnel.
 */
const orderLimiter = new RateLimiter({
  maxAttempts: 12,
  windowMs: 5 * 60 * 1000,
  blockMs: 5 * 60 * 1000
});

/**
 * Melyik etteremrol van szo: a kerésben megadott, vagy - ha csak egy etterem
 * van, ami a tipikus telepites - az alapertelmezett.
 */
function resolveRestaurant(req) {
  const requested = (req.body && req.body.restaurantId) || req.query.restaurantId;
  const restaurant = requested
    ? restaurantRepository.findById(requested)
    : restaurantRepository.getDefaultRestaurant();

  if (!restaurant) throw new NotFoundError('Az étterem nem található.');
  return restaurant;
}

router.get('/status', optionalAuth, (req, res) => {
  res.json({
    interface: 'online',
    public: true,
    user: req.user || null,
    message: 'Online rendeles - publikus API.'
  });
});

/** GET /api/online/restaurant - a vendegnek szolo alapadatok. */
router.get('/restaurant', (req, res, next) => {
  try {
    const restaurant = resolveRestaurant(req);
    res.json({
      restaurant: {
        id: restaurant.id,
        name: restaurant.name || '',
        address: restaurant.address || '',
        phone: restaurant.phone || ''
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/online/menu
 *
 * Kategoriak es csak az eppen elerheto tetelek - ugyanabbol a
 * `menuService.getAvailableMenu` fuggvenybol, amit a pinceri felulet is hasznal,
 * es ugyanabbol az adatbol, amit az admin szerkeszt.
 */
router.get('/menu', (req, res, next) => {
  try {
    const menu = menuService.getAvailableMenu(resolveRestaurant(req).id);
    res.json({ categories: menu.categories, items: menu.items, allergens: ALLERGENS });
  } catch (err) {
    next(err);
  }
});

/** GET /api/online/extras - a valaszthato kiegeszitok. */
router.get('/extras', (req, res, next) => {
  try {
    res.json({ extras: menuService.listExtras(resolveRestaurant(req).id) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/online/orders
 * Body: { guestName, items: [{ menuItemId, quantity, comment, extraIds }], restaurantId? }
 *
 * Uj online rendeles: `type: online`, `tableId: null`, a tetelek `pending`
 * allapotban. Sikeres leadas utan `order:created` esemeny megy a pinceri es a
 * konyhai szobaba is - ugyanaz, mint a pinceri leadasnal.
 */
router.post('/orders', async (req, res, next) => {
  const key = req.ip || 'ismeretlen';
  const limit = orderLimiter.check(key);
  if (limit.blocked) {
    res.status(429).json({
      error: 'too_many_requests',
      message: `Túl sok rendelés rövid idő alatt. Próbáld újra ${limit.retryAfterSeconds} másodperc múlva.`
    });
    return;
  }

  try {
    const restaurant = resolveRestaurant(req);
    const result = await orderService.submitOnlineOrder(restaurant.id, req.body);
    orderLimiter.registerAttempt(key);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
