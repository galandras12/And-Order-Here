const express = require('express');

const menuService = require('../../../services/menuService');
const { ALLERGENS } = require('../../../../shared/constants');

const router = express.Router();

/**
 * GET /api/admin/menu-items?categoryId=...&availableOnly=true
 * Az allergen katalogust is visszaadjuk, hogy a felulet ebbol epitse a
 * checkbox listat (egy forras, nincs duplikalt lista a kliensben).
 */
router.get('/', (req, res, next) => {
  try {
    const items = menuService.listItems(req.user.restaurantId, {
      categoryId: req.query.categoryId,
      availableOnly: req.query.availableOnly === 'true'
    });
    res.json({ items, allergens: ALLERGENS });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/menu-items - Body: { name, price, categoryId, allergens, isAvailable } */
router.post('/', async (req, res, next) => {
  try {
    const item = await menuService.createItem(req.user.restaurantId, req.body);
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/admin/menu-items/:id */
router.put('/:id', async (req, res, next) => {
  try {
    const item = await menuService.updateItem(req.user.restaurantId, req.params.id, req.body);
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/menu-items/:id/availability - Body: { isAvailable: boolean }
 * Gyors elerheto/elfogyott kapcsolo; menu_item:availability_changed
 * socket esemenyt is kikuld.
 */
router.patch('/:id/availability', async (req, res, next) => {
  try {
    const item = await menuService.setItemAvailability(
      req.user.restaurantId,
      req.params.id,
      req.body ? req.body.isAvailable : undefined
    );
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/admin/menu-items/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await menuService.deleteItem(req.user.restaurantId, req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
