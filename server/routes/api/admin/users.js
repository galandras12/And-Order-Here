const express = require('express');

const { userRepository } = require('../../../db/repositories');
const { toPublicUser } = require('../../../services/authService');

const router = express.Router();

/**
 * GET /api/admin/users
 * Felhasznalok listaja a sajat etteremben. A valasz sosem tartalmaz
 * jelszo- vagy PIN hash-t (toPublicUser szuri).
 *
 * Szerkesztes egy kesobbi szegmensben keszul el.
 */
router.get('/', (req, res) => {
  const users = userRepository
    .getByRestaurant(req.user.restaurantId)
    .map(toPublicUser)
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  res.json({ users });
});

module.exports = router;
