const { ROLES } = require('../../shared/constants');

const VALID_ROLES = Object.values(ROLES);

/**
 * Szerepkor szerinti hozzaferes-korlatozas. A requireAuth utan kell futnia.
 *
 *   router.use('/api/admin', requireAuth, requireRole([ROLES.ADMIN]));
 *
 * @param {string|string[]} roles egy szerepkor vagy szerepkorok listaja
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  const unknown = allowed.filter((role) => !VALID_ROLES.includes(role));
  if (unknown.length) {
    throw new Error(`[requireRole] Ismeretlen szerepkor: ${unknown.join(', ')}`);
  }

  return function roleGuard(req, res, next) {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Bejelentkezes szukseges.' });
      return;
    }

    if (!allowed.includes(req.user.role)) {
      res.status(403).json({
        error: 'forbidden',
        message: 'Ehhez a muvelethez nincs jogosultsagod.',
        requiredRoles: allowed
      });
      return;
    }

    next();
  };
}

module.exports = { requireRole };
