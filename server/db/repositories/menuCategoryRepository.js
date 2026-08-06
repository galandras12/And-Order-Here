const { createRepository } = require('./baseRepository');
const { COLLECTIONS } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.MENU_CATEGORIES);

/** Menukategoriak (Etelek / Italok / Egyeb) etterem szinten, sorrenddel. */
const menuCategoryRepository = {
  ...base,

  /**
   * @param {{ restaurantId: string, name: string, sortOrder?: number }} input
   */
  async createCategory(input) {
    const sortOrder =
      input.sortOrder ?? menuCategoryRepository.getByRestaurant(input.restaurantId).length;

    return base.insert({
      restaurantId: input.restaurantId,
      name: input.name,
      sortOrder
    });
  },

  /** Egy etterem kategoriai, sortOrder szerint rendezve. */
  getByRestaurant(restaurantId) {
    return base
      .findBy('restaurantId', restaurantId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  },

  /** Kategoria keresese nev alapjan. */
  getByName(restaurantId, name) {
    return base.find((cat) => cat.restaurantId === restaurantId && cat.name === name);
  },

  /** Kategoriak atrendezese: id-k tombje a kivant sorrendben. */
  async reorder(categoryIds) {
    const results = [];
    for (let i = 0; i < categoryIds.length; i += 1) {
      results.push(await base.update(categoryIds[i], { sortOrder: i }));
    }
    return results.filter(Boolean);
  }
};

module.exports = menuCategoryRepository;
