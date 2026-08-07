const express = require('express');

const floorStateService = require('../../services/floorStateService');
const reservationService = require('../../services/reservationService');

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
