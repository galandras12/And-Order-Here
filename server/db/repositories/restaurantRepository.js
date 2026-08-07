const { createRepository } = require('./baseRepository');
const { COLLECTIONS, DEFAULT_RECEIPT_FOOTER } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.RESTAURANTS);

/**
 * Etterem torzsadatok: cim, adoszazalek, szervizdij, AP kod, nyugta lablec.
 */
const restaurantRepository = {
  ...base,

  /**
   * Uj etterem letrehozasa. A hianyzo mezokre ertelmes alapertek kerul.
   * @param {{ name: string, address?: string, phone?: string, vatRate?: number,
   *           serviceFeeRate?: number, apCode?: string, receiptFooterMessage?: string }} input
   */
  async createRestaurant(input) {
    return base.insert({
      name: input.name,
      address: input.address || '',
      phone: input.phone || '',
      vatRate: input.vatRate ?? 27,
      serviceFeeRate: input.serviceFeeRate ?? 0,
      apCode: input.apCode || '',
      receiptFooterMessage: input.receiptFooterMessage || DEFAULT_RECEIPT_FOOTER
    });
  },

  /** Az elso (alapertelmezett) etterem - egy ettermes uzemhez. */
  getDefaultRestaurant() {
    const all = base.all();
    return all.length ? all[0] : null;
  },

  /** Etterem keresese nev alapjan (pontos egyezes). */
  getByName(name) {
    return base.findOneBy('name', name);
  },

  /** Szamlazasi beallitasok modositasa. */
  async updateSettings(restaurantId, patch) {
    return base.update(restaurantId, patch);
  }
};

module.exports = restaurantRepository;
