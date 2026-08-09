const express = require('express');

const floorPlanService = require('../../../services/floorPlanService');

const router = express.Router();

/** GET /api/admin/tables - az etterem asztalai. */
router.get('/', (req, res, next) => {
  try {
    res.json({
      tables: floorPlanService.listTables(req.user.restaurantId),
      limits: floorPlanService.LIMITS,
      defaultSize: floorPlanService.DEFAULT_SIZE
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/tables - Body: { label, posX, posY, rotation, width, height, comment } */
router.post('/', async (req, res, next) => {
  try {
    const table = await floorPlanService.createTable(req.user.restaurantId, req.body);
    res.status(201).json({ table });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/tables/:id
 * Pozicio, meret, elforgatas, cimke es komment modositasa. A szerkeszto a
 * muvelet lezarasakor (pointerup) hivja, nem minden pixelnyi mozgasnal.
 */
router.put('/:id', async (req, res, next) => {
  try {
    const table = await floorPlanService.updateTable(
      req.user.restaurantId,
      req.params.id,
      req.body
    );
    res.json({ table });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/tables/:id?force=true
 *
 * Ha az asztalhoz nyitott rendeles vagy jovobeli foglalas tartozik, elsore
 * 409-et adunk a reszletekkel; a felulet ebbol tud megerositest kerni, es a
 * force=true parameterrel ujra kuldeni.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const force = req.query.force === 'true';
    res.json(await floorPlanService.deleteTable(req.user.restaurantId, req.params.id, { force }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
