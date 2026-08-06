const { createRepository } = require('./baseRepository');
const { COLLECTIONS, ROLES } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.USERS);

const VALID_ROLES = Object.values(ROLES);

/**
 * Felhasznalok: pincer, szakacs, admin, logisztika.
 * A jelszo hash-t a hivo allitja elo (server/utils/password.js), ide mar keszen erkezik.
 */
const userRepository = {
  ...base,

  /**
   * @param {{ restaurantId: string, name: string, role: string, pinCode?: string,
   *           email?: string, passwordHash?: string, isActive?: boolean }} input
   */
  async createUser(input) {
    if (!VALID_ROLES.includes(input.role)) {
      throw new Error(`[users] Ismeretlen szerepkor: ${input.role} (${VALID_ROLES.join(', ')})`);
    }
    if (input.pinCode && userRepository.getByPin(input.restaurantId, input.pinCode)) {
      throw new Error('[users] Ez a PIN kod mar foglalt ebben az etteremben.');
    }

    return base.insert({
      restaurantId: input.restaurantId,
      name: input.name,
      role: input.role,
      pinCode: input.pinCode || null,
      email: input.email || null,
      passwordHash: input.passwordHash || null,
      isActive: input.isActive ?? true
    });
  },

  /** Egy etterem osszes felhasznaloja. */
  getByRestaurant(restaurantId) {
    return base.findBy('restaurantId', restaurantId);
  },

  /** Egy etterem felhasznaloi szerepkor szerint. */
  getByRole(restaurantId, role) {
    return base.filter((user) => user.restaurantId === restaurantId && user.role === role);
  },

  /** Aktiv felhasznalo keresese PIN kod alapjan (pincer / szakacs bejelentkezes). */
  getByPin(restaurantId, pinCode) {
    return base.find(
      (user) => user.restaurantId === restaurantId && user.pinCode === pinCode && user.isActive
    );
  },

  /** Felhasznalo keresese email alapjan (admin bejelentkezes). */
  getByEmail(email) {
    if (!email) return null;
    const needle = email.toLowerCase();
    return base.find((user) => (user.email || '').toLowerCase() === needle);
  },

  /** Aktivalas / deaktivalas - torles helyett, hogy a korabbi rendelesek hivatkozasa maradjon. */
  async setActive(userId, isActive) {
    return base.update(userId, { isActive: Boolean(isActive) });
  },

  /** Jelszo hash csereje. */
  async setPasswordHash(userId, passwordHash) {
    return base.update(userId, { passwordHash });
  }
};

module.exports = userRepository;
