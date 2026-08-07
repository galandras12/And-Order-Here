const express = require('express');

const menuService = require('../../../services/menuService');

const router = express.Router();

/** GET /api/admin/menu-categories - kategoriak sorrendben. */
router.get('/', (req, res, next) => {
  try {
    res.json({ categories: menuService.listCategories(req.user.restaurantId) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/menu-categories - Body: { name, sortOrder? } */
router.post('/', async (req, res, next) => {
  try {
    const category = await menuService.createCategory(req.user.restaurantId, req.body);
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/admin/menu-categories/:id - Body: { name, sortOrder? } */
router.put('/:id', async (req, res, next) => {
  try {
    const category = await menuService.updateCategory(
      req.user.restaurantId,
      req.params.id,
      req.body
    );
    res.json({ category });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/menu-categories/:id/move - Body: { direction: 'up' | 'down' }
 * A felulet fel/le gombjai ezt hivjak.
 */
router.post('/:id/move', async (req, res, next) => {
  try {
    const direction = req.body && req.body.direction === 'down' ? 'down' : 'up';
    const categories = await menuService.moveCategory(
      req.user.restaurantId,
      req.params.id,
      direction
    );
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/menu-categories/:id
 * Csak ures kategoria torolheto - egyebkent 409 a valasz.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await menuService.deleteCategory(req.user.restaurantId, req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
