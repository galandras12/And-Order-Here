const express = require('express');

const logisticsService = require('../../services/logisticsService');

const router = express.Router();

/**
 * Logisztikai API - penzugyi attekinto, blokk-archivum, napi kasszazaras.
 *
 * A router ele a /api/logistics mount rakja a requireAuth +
 * requireRole([logistics, admin]) vedelmet, igy itt mar biztos, hogy a hivo
 * jogosult, es minden lekerdezes a sajat etteremere vonatkozik
 * (req.user.restaurantId - a kliens nem tud masik etteremre ralatni).
 */

router.get('/status', (req, res) => {
  res.json({
    interface: 'logistics',
    user: req.user,
    message: 'Logisztikai API - forgalmi osszesito, blokk-archivum, kasszazaras.'
  });
});

/**
 * GET /api/logistics/summary?dateFrom=&dateTo=
 *
 * Napi / idoszaki forgalmi osszesito: bevetel, fizetesi mod szerinti bontas,
 * rendelesszam tipusonkent, kifizetetlen rendelesek.
 */
router.get('/summary', (req, res, next) => {
  try {
    res.json(logisticsService.getSummary(req.user.restaurantId, req.query));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/logistics/orders?dateFrom=&dateTo=&tableId=&waiterId=
 *                          &paymentMethod=&paymentStatus=&type=&page=&limit=
 *
 * Blokk-archivum: szurheto, lapozhato rendeleslista.
 */
router.get('/orders', (req, res, next) => {
  try {
    res.json(logisticsService.listOrders(req.user.restaurantId, req.query));
  } catch (err) {
    next(err);
  }
});

/** GET /api/logistics/filter-options - a szuro urlap valaszthato ertekei. */
router.get('/filter-options', (req, res, next) => {
  try {
    res.json(logisticsService.getFilterOptions(req.user.restaurantId));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/logistics/cash-closing?dateFrom=&dateTo=
 *
 * A korabbi zarasok listaja. A `limit` a visszaadott rekordok szamat korlatozza.
 */
router.get('/cash-closing', (req, res, next) => {
  try {
    res.json(logisticsService.listCashClosings(req.user.restaurantId, req.query));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/logistics/cash-closing/preview?dateFrom=&dateTo=
 *
 * A rendszer altal vart keszpenz-egyenleg - ezt tolti be a zaras urlap, mielott
 * a munkatars beirja a leszamolt osszeget.
 */
router.get('/cash-closing/preview', (req, res, next) => {
  try {
    res.json(logisticsService.getCashClosingPreview(req.user.restaurantId, req.query));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/logistics/cash-closing
 * Body: { dateFrom?, dateTo?, actualAmount, note? }
 *
 * A vart osszeget a szerver szamolja ujra, a kliens csak a leszamolt osszeget
 * kuldi - igy a rogzitett elteres nem hamisithato.
 */
router.post('/cash-closing', async (req, res, next) => {
  try {
    const result = await logisticsService.createCashClosing(
      req.user.restaurantId,
      req.user.id,
      req.body
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/logistics/orders/:id
 *
 * Egy rendeles reszletes nezete: a blokk olvashato valtozata (10. szegmens
 * sablonja), a tetelek es a rogzitett fizetesek.
 *
 * A parameteres utvonal a fix utak (pl. /orders elott mar lekezelve) utan all,
 * hogy ne nyelje el oket.
 */
router.get('/orders/:id', (req, res, next) => {
  try {
    res.json(logisticsService.getOrderDetail(req.user.restaurantId, req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
