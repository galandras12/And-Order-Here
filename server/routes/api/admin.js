const express = require('express');

const { userRepository } = require('../../db/repositories');
const { toPublicUser } = require('../../services/authService');

const router = express.Router();

/**
 * Admin API. A router ele a /api/admin mount rakja a requireAuth +
 * requireRole(['admin']) vedelmet, igy itt mar biztos, hogy req.user admin.
 */

router.get('/status', (req, res) => {
  res.json({
    interface: 'admin',
    user: req.user,
    message: 'Admin API - a tovabbi funkciok kesobbi szegmensben keszulnek el.'
  });
});

/**
 * GET /api/admin/users
 * Felhasznalok listaja a sajat etteremben. A valasz sosem tartalmaz
 * jelszo- vagy PIN hash-t (toPublicUser szuri).
 */
router.get('/users', (req, res) => {
  const users = userRepository
    .getByRestaurant(req.user.restaurantId)
    .map(toPublicUser)
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  res.json({ users });
});

module.exports = router;
