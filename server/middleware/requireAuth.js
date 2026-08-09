const authService = require('../services/authService');

/**
 * JWT ellenorzes az Authorization: Bearer <token> header alapjan.
 *
 * Sikeres ellenorzes utan a kovetkezo mezok allnak rendelkezesre:
 *   req.user  - a bejelentkezett felhasznalo (hash mezok nelkul)
 *   req.token - a nyers token
 *   req.auth  - a dekodolt JWT payload
 */
function requireAuth(req, res, next) {
  const token = authService.extractBearerToken(req.get('authorization'));

  if (!token) {
    res.status(401).json({ error: 'unauthorized', message: 'Hianyzo Authorization fejlec.' });
    return;
  }

  try {
    const { payload, user } = authService.verifyToken(token);
    req.token = token;
    req.auth = payload;
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'AuthError') {
      res.status(err.status || 401).json({ error: err.code, message: err.message });
      return;
    }
    next(err);
  }
}

/**
 * Opcionalis autentikacio: ha van ervenyes token, kitolti a req.user-t,
 * ha nincs, akkor is tovabbengedi a kerest. Publikus (online) vegpontokhoz,
 * ahol a bejelentkezett vendeg tobbet lathat, de belepes nem kotelezo.
 */
function optionalAuth(req, res, next) {
  const token = authService.extractBearerToken(req.get('authorization'));
  if (!token) {
    next();
    return;
  }

  try {
    const { payload, user } = authService.verifyToken(token);
    req.token = token;
    req.auth = payload;
    req.user = user;
  } catch {
    // Ervenytelen token eseten ugy kezeljuk, mintha be sem lenne jelentkezve.
  }

  next();
}

module.exports = { requireAuth, optionalAuth };
