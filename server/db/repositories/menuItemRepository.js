const { createRepository } = require('./baseRepository');
const { COLLECTIONS } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.MENU_ITEMS);

/**
 * Etlap tetelek. A tetel a kategorian keresztul tartozik etteremhez
 * (menuItems.categoryId -> menuCategories.id -> menuCategories.restaurantId).
 */
const menuItemRepository = {
  ...base,

  /**
   * @param {{ categoryId: string, name: string, price: number,
   *           isAvailable?: boolean, allergens?: string[] }} input
   */
  async createItem(input) {
    return base.insert({
      categoryId: input.categoryId,
      name: input.name,
      price: input.price,
      isAvailable: input.isAvailable ?? true,
      allergens: input.allergens || []
    });
  },

  /** Egy kategoria tetelei. */
  getByCategory(categoryId) {
    return base.findBy('categoryId', categoryId);
  },

  /** Egy kategoria elerheto tetelei (online etlaphoz, rendelesfelvetelhez). */
  getAvailableByCategory(categoryId) {
    return base.filter((item) => item.categoryId === categoryId && item.isAvailable);
  },

  /** Tobb kategoria tetelei egyben (pl. egy etterem teljes etlapja). */
  getByCategoryIds(categoryIds) {
    const ids = new Set(categoryIds);
    return base.filter((item) => ids.has(item.categoryId));
  },

  /** Nev szerinti kereses (reszlet egyezes, kis-nagybetu fuggetlen). */
  search(term) {
    const needle = String(term || '').toLowerCase();
    if (!needle) return [];
    return base.filter((item) => item.name.toLowerCase().includes(needle));
  },

  /** Elfogyott / ujra elerheto jelolese (a konyha es a logisztika hasznalja). */
  async setAvailability(itemId, isAvailable) {
    return base.update(itemId, { isAvailable: Boolean(isAvailable) });
  },

  /** Ar modositasa. */
  async setPrice(itemId, price) {
    return base.update(itemId, { price });
  },

  /** Adott allergent tartalmazo tetelek. */
  getByAllergen(allergen) {
    return base.filter((item) => (item.allergens || []).includes(allergen));
  }
};

module.exports = menuItemRepository;
