const { createRepository } = require('./baseRepository');
const { COLLECTIONS } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.EXTRAS);

/**
 * Kiegeszitok (extra sajt, tejszinhab, csomagolas stb.).
 * A rendelesi tetelek az orderItems.extraIds tombben hivatkoznak rajuk.
 */
const extraRepository = {
  ...base,

  /**
   * @param {{ restaurantId: string, name: string, price?: number }} input
   */
  async createExtra(input) {
    return base.insert({
      restaurantId: input.restaurantId,
      name: input.name,
      price: input.price ?? 0
    });
  },

  /** Egy etterem kiegeszitoi. */
  getByRestaurant(restaurantId) {
    return base.findBy('restaurantId', restaurantId);
  },

  /** Tobb extra lekerese id lista alapjan (orderItem.extraIds feloldasa). */
  getByIds(extraIds) {
    const ids = new Set(extraIds || []);
    return base.filter((extra) => ids.has(extra.id));
  },

  /** Egy id lista osszara - a tetel arahoz adodik hozza. */
  sumPrice(extraIds) {
    return extraRepository
      .getByIds(extraIds)
      .reduce((total, extra) => total + (extra.price || 0), 0);
  }
};

module.exports = extraRepository;
