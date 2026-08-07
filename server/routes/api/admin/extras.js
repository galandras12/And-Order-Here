const express = require('express');

const menuService = require('../../../services/menuService');

const router = express.Router();

/** GET /api/admin/extras */
router.get('/', (req, res, next) => {
  try {
    res.json({ extras: menuService.listExtras(req.user.restaurantId) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/extras - Body: { name, price } */
router.post('/', async (req, res, next) => {
  try {
    const extra = await menuService.createExtra(req.user.restaurantId, req.body);
    res.status(201).json({ extra });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/admin/extras/:id */
router.put('/:id', async (req, res, next) => {
  try {
    const extra = await menuService.updateExtra(req.user.restaurantId, req.params.id, req.body);
    res.json({ extra });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/admin/extras/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await menuService.deleteExtra(req.user.restaurantId, req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
