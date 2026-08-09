const express = require('express');

const floorPlanService = require('../../../services/floorPlanService');

const router = express.Router();

/** GET /api/admin/zones - az etterem zonai (pl. terasz, belso ter). */
router.get('/', (req, res, next) => {
  try {
    res.json({ zones: floorPlanService.listZones(req.user.restaurantId) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/zones - Body: { label, shapeCoordinates: [{x,y}, ...] } */
router.post('/', async (req, res, next) => {
  try {
    const zone = await floorPlanService.createZone(req.user.restaurantId, req.body);
    res.status(201).json({ zone });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/admin/zones/:id - atnevezes es/vagy uj alakzat. */
router.put('/:id', async (req, res, next) => {
  try {
    const zone = await floorPlanService.updateZone(req.user.restaurantId, req.params.id, req.body);
    res.json({ zone });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/admin/zones/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await floorPlanService.deleteZone(req.user.restaurantId, req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
