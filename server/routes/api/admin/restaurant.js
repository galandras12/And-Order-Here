const express = require('express');

const restaurantService = require('../../../services/restaurantService');

const router = express.Router();

/**
 * GET /api/admin/restaurant
 * A bejelentkezett admin ettermenek alapadatai.
 */
router.get('/', (req, res, next) => {
  try {
    res.json({ restaurant: restaurantService.getRestaurant(req.user.restaurantId) });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/restaurant
 * Body: { name, address, phone, vatRate, serviceFeeRate, apCode, receiptFooterMessage }
 *
 * A vatRate es serviceFeeRate szazalekban ertendo (0-100).
 */
router.put('/', async (req, res, next) => {
  try {
    const restaurant = await restaurantService.updateRestaurant(req.user.restaurantId, req.body);
    res.json({ restaurant });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
