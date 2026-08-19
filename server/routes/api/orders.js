const express = require('express');

const paymentService = require('../../services/paymentService');
const { orderRepository } = require('../../db/repositories');
const { optionalAuth } = require('../../middleware');
const { NotFoundError } = require('../../utils/validation');
const { RateLimiter } = require('../../utils/rateLimiter');
const { ROLES, ORDER_TYPE, PAYMENT_METHODS } = require('../../../shared/constants');

const router = express.Router();

/**
 * Rendeles szintu, feluleteken atnyulo muveletek - jelenleg a fizetes.
 *
 * Szandekosan **nem** a /api/waiter vagy /api/online ala kerult: ugyanezt a
 * vegpontot hivja a pincer (bejelentkezve) es a vendeg (bejelentkezes nelkul,
 * az online penztarbol), igy a fizetes egy helyen, egyfajta szabaly szerint
 * rogzul.
 *
 * Jogosultsag:
 *   - bejelentkezett pincer / admin: a sajat etterme barmelyik rendelese,
 *   - bejelentkezes nelkul: kizarolag **online** rendeles, es csak a rendeles
 *     azonositojanak ismereteben. Az azonosito nanoid (kitalalhatatlan), es a
 *     vendeg a sajat leadasa utan kapja meg - vagyis maga az id a belepo. Igy a
 *     penztar mukodik bejelentkezes nelkul is, de mas rendeleseihez nem fer hozza.
 */

/** A publikus (vendeg oldali) fizetes-rogzites korlatozasa. */
const guestLimiter = new RateLimiter({
  maxAttempts: 20,
  windowMs: 5 * 60 * 1000,
  blockMs: 5 * 60 * 1000
});

/** Szemelyzet, aki fizetest rogzithet. A szakacsnak ehhez nincs koze. */
const STAFF_ROLES = [ROLES.WAITER, ROLES.ADMIN];

/**
 * A rendeles betoltese a jogosultsag ellenorzesevel.
 * @throws {NotFoundError} ha nem letezik, vagy a hivo nem lathatja
 */
function loadOrder(req) {
  const order = orderRepository.findById(req.params.id);
  if (!order) throw new NotFoundError('A rendelés nem található.');

  if (req.user) {
    if (order.restaurantId !== req.user.restaurantId) {
      throw new NotFoundError('A rendelés nem található.');
    }
    if (!STAFF_ROLES.includes(req.user.role)) {
      const error = new Error('Ehhez a művelethez nincs jogosultságod.');
      error.status = 403;
      error.code = 'forbidden';
      throw error;
    }
    return order;
  }

  // Bejelentkezes nelkul csak az online rendeles penztara elerheto.
  if (order.type !== ORDER_TYPE.ONLINE) {
    throw new NotFoundError('A rendelés nem található.');
  }
  return order;
}

/**
 * GET /api/orders/:id/payments
 *
 * A rendeles fizetesi allapota: vegosszeg (AFA-val es szervizdijjal), az eddig
 * befolyt osszeg, a hatralek, es a rogzitett fizetesek. A penztar es a pinceri
 * attekinto is ebbol dolgozik.
 */
router.get('/:id/payments', optionalAuth, (req, res, next) => {
  try {
    const order = loadOrder(req);
    res.json({
      ...paymentService.getPaymentState(order.restaurantId, order.id),
      methods: PAYMENT_METHODS
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orders/:id/payments
 * Body: { method: 'card'|'szep_card'|'coupon'|'cash'|'atm_later', amount? }
 *
 * Fizetes rogzitese. Az osszeg elhagyhato - alapertelmezesben a meg hatralevo
 * teljes osszeg. Sikeres rogzites utan `order:payment_recorded` esemeny megy a
 * pinceri, admin es logisztikai szobaba.
 */
router.post('/:id/payments', optionalAuth, async (req, res, next) => {
  try {
    const order = loadOrder(req);

    // A vendeg oldali (token nelkuli) rogzitest korlatozzuk.
    if (!req.user) {
      const key = req.ip || 'ismeretlen';
      const limit = guestLimiter.check(key);
      if (limit.blocked) {
        res.status(429).json({
          error: 'too_many_requests',
          message: `Túl sok próbálkozás. Próbáld újra ${limit.retryAfterSeconds} másodperc múlva.`
        });
        return;
      }
      guestLimiter.registerAttempt(key);
    }

    const result = await paymentService.recordPayment(order.restaurantId, order.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
