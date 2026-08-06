const { createRepository } = require('./baseRepository');
const { COLLECTIONS, ROLES } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.USERS);

const VALID_ROLES = Object.values(ROLES);

/**
 * Felhasznalok: pincer, szakacs, admin, logisztika.
 *
 * A jelszo es a PIN kod is hashelve tarolodik (passwordHash, pinCodeHash) - a
 * hasheles es az ellenorzes a service retegben tortenik (server/utils/password.js),
 * ide mar kesz hash erkezik. A repository nem lat nyilt jelszot.
 */
const userRepository = {
  ...base,

  /**
   * @param {{ restaurantId: string, name: string, role: string, pinCodeHash?: string,
   *           email?: string, passwordHash?: string, isActive?: boolean }} input
   */
  async createUser(input) {
    if (!VALID_ROLES.includes(input.role)) {
      throw new Error(`[users] Ismeretlen szerepkor: ${input.role} (${VALID_ROLES.join(', ')})`);
    }
    if (input.email && userRepository.getByEmail(input.email)) {
      throw new Error('[users] Ezzel az email cimmel mar letezik felhasznalo.');
    }

    return base.insert({
      restaurantId: input.restaurantId,
      name: input.name,
      role: input.role,
      pinCodeHash: input.pinCodeHash || null,
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

  /**
   * PIN-nel belepni tudo aktiv felhasznalok egy etteremben.
   *
   * A PIN hashelve van, ezert nem lehet kozvetlenul rakeresni: a service reteg
   * ezen a listan megy vegig, es hash-osszehasonlitassal donti el, ki lepett be.
   */
  getPinCandidates(restaurantId) {
    return base.filter(
      (user) => user.restaurantId === restaurantId && user.isActive && Boolean(user.pinCodeHash)
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
  },

  /** PIN hash csereje (null = nincs PIN belepes). */
  async setPinCodeHash(userId, pinCodeHash) {
    return base.update(userId, { pinCodeHash });
  }
};

module.exports = userRepository;
