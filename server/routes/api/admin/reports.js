const express = require('express');

const reportService = require('../../../services/reportService');

const router = express.Router();

/**
 * Vezetoi riportok. A /api/admin mount rakja ele a requireAuth +
 * requireRole(['admin']) vedelmet, igy itt mar biztos, hogy req.user admin, es
 * minden lekerdezes a sajat etteremere (req.user.restaurantId) vonatkozik - a
 * kliens nem tud masik etterem adatait lekerdezni.
 *
 * Minden vegpont ugyanazt a ket datum parametert varja (`dateFrom`, `dateTo`);
 * ha nem kap, az elmult 7 napot adja vissza.
 */

/** GET /api/admin/reports/top-items?dateFrom=&dateTo=&categoryId=&limit= */
router.get('/top-items', (req, res, next) => {
  try {
    res.json(reportService.getTopItems(req.user.restaurantId, req.query));
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/reports/peak-hours?dateFrom=&dateTo= */
router.get('/peak-hours', (req, res, next) => {
  try {
    res.json(reportService.getPeakHours(req.user.restaurantId, req.query));
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/reports/waiter-performance?dateFrom=&dateTo= */
router.get('/waiter-performance', (req, res, next) => {
  try {
    res.json(reportService.getWaiterPerformance(req.user.restaurantId, req.query));
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/reports/kitchen-times?dateFrom=&dateTo=&categoryId=&menuItemId= */
router.get('/kitchen-times', (req, res, next) => {
  try {
    res.json(reportService.getKitchenTimes(req.user.restaurantId, req.query));
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/reports/filter-options - kategoriak es tetelek a szurokhoz. */
router.get('/filter-options', (req, res, next) => {
  try {
    res.json(reportService.getFilterOptions(req.user.restaurantId));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
