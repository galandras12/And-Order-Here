const express = require('express');

const floorStateService = require('../../services/floorStateService');
const reservationService = require('../../services/reservationService');
const orderService = require('../../services/orderService');
const { ALLERGENS } = require('../../../shared/constants');

const router = express.Router();

/**
 * Pinceri API. A router ele a /api/waiter mount rakja a requireAuth +
 * requireRole(['waiter']) vedelmet, igy itt mar biztos, hogy req.user pincer,
 * es minden lekerdezes a sajat etteremere vonatkozik.
 *
 * Az asztalterkep elrendezese csak olvashato innen - szerkeszteni az admin tud
 * (/api/admin/tables, /api/admin/zones).
 */

router.get('/status', (req, res) => {
  res.json({
    interface: 'waiter',
    user: req.user,
    message: 'Pinceri API - asztalterkep es foglalas.'
  });
});

/** GET /api/waiter/tables - az elrendezes (pozicio, meret, elforgatas). */
router.get('/tables', (req, res, next) => {
  try {
    res.json({ tables: floorStateService.listTables(req.user.restaurantId) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/waiter/zones - a zonak sokszogei (online rendelesek terulete). */
router.get('/zones', (req, res, next) => {
  try {
    res.json({ zones: floorStateService.listZones(req.user.restaurantId) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/waiter/table-states
 *
 * Asztalonkenti allapot (szabad / rendeles alatt / szamlat kert), a kovetkezo
 * foglalas, es a meg fel nem dolgozott online rendelesek osszesitese. Kicsi
 * valasz, ezert socket esemeny utan is olcso ujra lekerni.
 */
router.get('/table-states', (req, res, next) => {
  try {
    res.json(floorStateService.getTableStates(req.user.restaurantId));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/waiter/reservations
 * Body: { tableId, reservedFrom, reservedTo, comment? }
 *
 * Sikeres foglalas table:reserved socket esemenyt is kuld.
 */
router.post('/reservations', async (req, res, next) => {
  try {
    const reservation = await reservationService.createReservation(
      req.user.restaurantId,
      req.body
    );
    res.status(201).json({ reservation });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/waiter/menu
 *
 * A rendelesfelvetel etlapja: kategoriak, csak elerheto tetelek, extrak es az
 * allergen katalogus (hogy a felulet egy forrasbol dolgozzon).
 */
router.get('/menu', (req, res, next) => {
  try {
    res.json({ ...orderService.getMenu(req.user.restaurantId), allergens: ALLERGENS });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/waiter/tables/:id/order
 * Az asztal nyitott rendelese a teteleivel (vagy order: null).
 */
router.get('/tables/:id/order', (req, res, next) => {
  try {
    res.json(orderService.getOpenOrderForTable(req.user.restaurantId, req.params.id));
  } catch (err) {
    next(err);
  }
});

/** GET /api/waiter/orders/:id - egy konkret rendeles (pl. online). */
router.get('/orders/:id', (req, res, next) => {
  try {
    res.json({ order: orderService.getOrder(req.user.restaurantId, req.params.id) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/waiter/online-orders - a meg le nem zart online rendelesek. */
router.get('/online-orders', (req, res, next) => {
  try {
    res.json({ orders: orderService.listOpenOnlineOrders(req.user.restaurantId) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/waiter/orders
 * Body: { tableId | orderId, items: [{ menuItemId, quantity, comment, extraIds }] }
 *
 * Asztalhoz: ha van nyitott rendeles, ahhoz kerulnek a tetelek, kulonben uj
 * dine_in rendeles jon letre a bejelentkezett pincerrel. Minden uj tetel
 * `pending` allapotban indul, es socket esemeny is megy a konyhanak.
 */
router.post('/orders', async (req, res, next) => {
  try {
    const result = await orderService.submitOrder(req.user.restaurantId, req.user.id, req.body);
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/waiter/tables/:id/reservations - egy asztal foglalasai. */
router.get('/tables/:id/reservations', (req, res, next) => {
  try {
    res.json({
      reservations: reservationService.listByTable(req.user.restaurantId, req.params.id)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
