const express = require('express');

const restaurantRouter = require('./restaurant');
const menuCategoriesRouter = require('./menuCategories');
const menuItemsRouter = require('./menuItems');
const extrasRouter = require('./extras');
const tablesRouter = require('./tables');
const zonesRouter = require('./zones');
const usersRouter = require('./users');

const router = express.Router();

/**
 * Admin API. A /api/admin mount rakja ele a requireAuth +
 * requireRole(['admin']) vedelmet, igy itt mar biztos, hogy req.user admin,
 * es minden muvelet a sajat etteremere (req.user.restaurantId) vonatkozik.
 */

router.get('/status', (req, res) => {
  res.json({
    interface: 'admin',
    user: req.user,
    message: 'Admin API - etterem alapadatok, menu es extrak kezelese.'
  });
});

router.use('/restaurant', restaurantRouter);
router.use('/menu-categories', menuCategoriesRouter);
router.use('/menu-items', menuItemsRouter);
router.use('/extras', extrasRouter);
router.use('/tables', tablesRouter);
router.use('/zones', zonesRouter);
router.use('/users', usersRouter);

module.exports = router;
