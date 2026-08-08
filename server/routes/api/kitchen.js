const express = require('express');

const kitchenService = require('../../services/kitchenService');

const router = express.Router();

/**
 * Konyhai API. A router ele a /api/kitchen mount rakja a requireAuth +
 * requireRole(['cook']) vedelmet, igy itt mar biztos, hogy req.user cook, es
 * minden muvelet a sajat etteremere vonatkozik.
 *
 * A szakacs csak `preparing` es `ready` allapotot allithat; a kiszolgalas
 * (`served`) a pinceri felulete (/api/waiter/order-items/:id/served).
 */

router.get('/status', (req, res) => {
  res.json({
    interface: 'kitchen',
    user: req.user,
    message: 'Konyhai API - munkapult es tetel allapotok.'
  });
});

/**
 * GET /api/kitchen/orders
 *
 * A munkapult tartalma: a nyitott rendelesek asztalonkent blokkba rendezve,
 * kizarolag az etel kategoriaba tartozo tetelekkel.
 */
router.get('/orders', (req, res, next) => {
  try {
    res.json(kitchenService.getBoard(req.user.restaurantId));
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/kitchen/order-items/:id/status
 * Body: { status: 'preparing' | 'ready' }
 *
 * Sikeres valtas utan order_item:status_changed esemeny megy ki - ezt a
 * pinceri felulet mar fogadja (8. szegmens).
 */
router.patch('/order-items/:id/status', async (req, res, next) => {
  try {
    res.json(
      await kitchenService.setItemStatus(
        req.user.restaurantId,
        req.params.id,
        req.body && req.body.status
      )
    );
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/kitchen/orders/:orderId/items-status
 * Body: { status: 'preparing' | 'ready', itemIds?: string[] }
 *
 * Egy blokk teteleinek leptetese egyszerre. Az itemIds elhagyhato - ilyenkor a
 * blokk minden (meg ki nem szolgalt) etel tetele valtozik.
 */
router.patch('/orders/:orderId/items-status', async (req, res, next) => {
  try {
    const body = req.body || {};
    res.json(
      await kitchenService.setItemsStatus(
        req.user.restaurantId,
        req.params.orderId,
        body.status,
        body.itemIds
      )
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
