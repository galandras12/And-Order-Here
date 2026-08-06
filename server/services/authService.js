const jwt = require('jsonwebtoken');

const { config } = require('../config');
const { userRepository, restaurantRepository } = require('../db/repositories');
const { verifyPassword, verifyPin, isValidPinFormat } = require('../utils/password');
const { RateLimiter } = require('../utils/rateLimiter');
const { ROLES } = require('../../shared/constants');

/**
 * Autentikacios service.
 *
 * Kizarolag a repository retegen keresztul er adatot - soha nem nyul a JSON
 * fajlhoz. Ha kesobb SQL adatbazisra valtunk, eleg a repository reteget
 * lecserelni, ez a modul (jelszo-ellenorzes, token generalas es ervenyesites)
 * valtozatlan maradhat.
 *
 * A munkamenet JWT tokennel mukodik: a token maga hordozza a userId, role es
 * restaurantId adatokat, igy nincs szukseg szerver oldali session-tarolora.
 */

/** Hosszabb elettartamu token: pincer / szakacs tableten ritkabban lep be ujra. */
const STAFF_ROLES = [ROLES.WAITER, ROLES.COOK];

/** Bejelentkezesi probalkozasok korlatozasa (memoriaban, kulso szolgaltatas nelkul). */
const loginLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 5 * 60 * 1000, blockMs: 5 * 60 * 1000 });
const pinLimiter = new RateLimiter({ maxAttempts: 8, windowMs: 5 * 60 * 1000, blockMs: 10 * 60 * 1000 });

/** Egyseges hiba, amit a route reteg HTTP valaszra tud forditani. */
class AuthError extends Error {
  constructor(message, { status = 401, code = 'unauthorized', retryAfterSeconds } = {}) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
    if (retryAfterSeconds) this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A tokenbe es a valaszba kerulo, biztonsagos felhasznalo-nezet (hash nelkul). */
function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    restaurantId: user.restaurantId,
    name: user.name,
    role: user.role,
    email: user.email || null,
    isActive: user.isActive,
    hasPin: Boolean(user.pinCodeHash)
  };
}

/** Szerepkor szerinti token elettartam. */
function tokenLifetimeFor(role) {
  return STAFF_ROLES.includes(role) ? config.jwtExpiresStaff : config.jwtExpiresAdmin;
}

function requireSecret() {
  if (!config.jwtSecret) {
    throw new AuthError('Nincs beallitva JWT_SECRET, a bejelentkezes nem mukodik.', {
      status: 500,
      code: 'server_misconfigured'
    });
  }
}

/**
 * JWT token keszitese egy felhasznalohoz.
 * @returns {{ token: string, expiresIn: string, user: object }}
 */
function issueToken(user) {
  requireSecret();

  const expiresIn = tokenLifetimeFor(user.role);
  const token = jwt.sign(
    { sub: user.id, userId: user.id, role: user.role, restaurantId: user.restaurantId },
    config.jwtSecret,
    { expiresIn }
  );

  return { token, expiresIn, user: toPublicUser(user) };
}

/**
 * Bejelentkezes email + jelszoval (admin / logisztika / vezetoseg).
 *
 * @param {string} email
 * @param {string} password
 * @param {{ rateLimitKey?: string }} [options] pl. IP cim, a probalkozas-korlatozashoz
 * @returns {Promise<{ token: string, expiresIn: string, user: object }>}
 */
async function loginWithPassword(email, password, options = {}) {
  requireSecret();

  if (!email || !password) {
    throw new AuthError('Add meg az email cimet es a jelszot.', { status: 400, code: 'missing_credentials' });
  }

  const limitKey = `pw:${options.rateLimitKey || 'global'}:${String(email).toLowerCase()}`;
  const limit = loginLimiter.check(limitKey);
  if (limit.blocked) {
    throw new AuthError('Tul sok sikertelen probalkozas, probald ujra kesobb.', {
      status: 429,
      code: 'too_many_attempts',
      retryAfterSeconds: limit.retryAfterSeconds
    });
  }

  const user = userRepository.getByEmail(email);
  // Ismeretlen email es rossz jelszo eseten ugyanaz a valasz, hogy ne lehessen
  // kitalalni, letezik-e a felhasznalo.
  const valid = user && user.isActive && (await verifyPassword(password, user.passwordHash));

  if (!valid) {
    loginLimiter.registerFailure(limitKey);
    throw new AuthError('Hibas email cim vagy jelszo.', { code: 'invalid_credentials' });
  }

  loginLimiter.reset(limitKey);
  return issueToken(user);
}

/**
 * Bejelentkezes PIN koddal (pincer / szakacs gyors belepes).
 *
 * A PIN hashelve van tarolva, ezert nem lehet rakeresni: az etterem PIN-nel
 * belepni tudo, aktiv felhasznaloin megyunk vegig, es hash-osszehasonlitassal
 * dontjuk el, ki lepett be.
 *
 * @param {string} pinCode
 * @param {string} [restaurantId] elhagyhato, ha csak egy etterem van
 * @param {{ rateLimitKey?: string }} [options]
 */
async function loginWithPin(pinCode, restaurantId, options = {}) {
  requireSecret();

  if (!isValidPinFormat(pinCode)) {
    throw new AuthError('A PIN kod 4-6 szamjegy lehet.', { status: 400, code: 'invalid_pin_format' });
  }

  const targetRestaurantId = restaurantId || restaurantRepository.getDefaultRestaurant()?.id;
  if (!targetRestaurantId) {
    throw new AuthError('Nincs etterem az adatbazisban.', { status: 400, code: 'no_restaurant' });
  }

  const limitKey = `pin:${options.rateLimitKey || 'global'}:${targetRestaurantId}`;
  const limit = pinLimiter.check(limitKey);
  if (limit.blocked) {
    throw new AuthError('Tul sok sikertelen probalkozas, probald ujra kesobb.', {
      status: 429,
      code: 'too_many_attempts',
      retryAfterSeconds: limit.retryAfterSeconds
    });
  }

  const candidates = userRepository.getPinCandidates(targetRestaurantId);
  let matched = null;
  for (const candidate of candidates) {
    // Nem lepunk ki az elso talalatnal sem korabban: minden jelolttel osszehasonlitunk,
    // igy a valaszido nem arulja el, hanyadik felhasznalo PIN-jet adtak meg.
    if (await verifyPin(pinCode, candidate.pinCodeHash)) {
      matched = matched || candidate;
    }
  }

  if (!matched) {
    pinLimiter.registerFailure(limitKey);
    throw new AuthError('Ervenytelen PIN kod.', { code: 'invalid_pin' });
  }

  pinLimiter.reset(limitKey);
  return issueToken(matched);
}

/**
 * Token ervenyesites es dekodolas.
 *
 * A tokenben levo adatokat nem fogadjuk el vakon: a felhasznalot minden
 * keresnel visszaolvassuk, igy a kozben deaktivalt vagy torolt fiok tokenje
 * azonnal ervenytelen lesz.
 *
 * @param {string} token
 * @returns {{ payload: object, user: object }}
 * @throws {AuthError} ervenytelen vagy lejart token eseten
 */
function verifyToken(token) {
  requireSecret();

  if (!token) {
    throw new AuthError('Hianyzo token.', { code: 'missing_token' });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AuthError('A munkamenet lejart, jelentkezz be ujra.', { code: 'token_expired' });
    }
    throw new AuthError('Ervenytelen token.', { code: 'invalid_token' });
  }

  const user = userRepository.findById(payload.userId || payload.sub);
  if (!user || !user.isActive) {
    throw new AuthError('A felhasznalo nem letezik vagy inaktiv.', { code: 'user_inactive' });
  }

  return { payload, user: toPublicUser(user) };
}

/**
 * Kijelentkezes. JWT eseten szerver oldalon nincs teendo - a kliens dobja el a
 * tokent. Azert van kulon fuggveny, hogy a route reteg egysegesen a service-t
 * hivja, es kesobb (pl. token feketelista) itt lehessen boviteni.
 */
function logout() {
  return { ok: true };
}

/** Az aktualis felhasznalo adatai token alapjan. */
function getCurrentUser(token) {
  return verifyToken(token).user;
}

/** Authorization: Bearer <token> header feldolgozasa. */
function extractBearerToken(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

module.exports = {
  AuthError,
  loginWithPassword,
  loginWithPin,
  verifyToken,
  getCurrentUser,
  logout,
  issueToken,
  extractBearerToken,
  toPublicUser,
  tokenLifetimeFor
};
