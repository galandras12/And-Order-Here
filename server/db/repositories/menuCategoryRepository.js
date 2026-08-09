const { createRepository } = require('./baseRepository');
const { COLLECTIONS, MENU_CATEGORY_KIND } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.MENU_CATEGORIES);

/** Menukategoriak (Etelek / Italok / Egyeb) etterem szinten, sorrenddel. */
const menuCategoryRepository = {
  ...base,

  /**
   * @param {{ restaurantId: string, name: string, sortOrder?: number,
   *           kind?: string }} input
   */
  async createCategory(input) {
    // A lista vegere: a legnagyobb meglevo sortOrder + 1. (A darabszam nem jo:
    // torles vagy atrendezes utan utkozhet egy meglevo ertekkel.)
    const existing = menuCategoryRepository.getByRestaurant(input.restaurantId);
    const nextSortOrder = existing.reduce(
      (max, category) => Math.max(max, Number(category.sortOrder) || 0),
      -1
    ) + 1;

    return base.insert({
      restaurantId: input.restaurantId,
      name: input.name,
      sortOrder: input.sortOrder ?? nextSortOrder,
      // Alapertelmezes az etel: a konyhai sorbol kimaradni rosszabb, mint egy
      // felesleges tetelt latni ott.
      kind: input.kind || MENU_CATEGORY_KIND.FOOD
    });
  },

  /** Egy etterem adott tipusu kategoriai (pl. a konyhai sorhoz az etelek). */
  getByKind(restaurantId, kind) {
    return menuCategoryRepository
      .getByRestaurant(restaurantId)
      .filter((category) => category.kind === kind);
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
