const { createRepository } = require('./baseRepository');
const { COLLECTIONS } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.CASH_CLOSINGS);

/**
 * Napi (vagy muszakonkenti) kasszazarasok.
 *
 * Egy rekord egy lezart idoszakot dokumental: mennyi keszpenznek kellett volna
 * a fiokban lennie a rogzitett fizetesek alapjan (`expectedAmount`), mennyit
 * szamolt le a munkatars (`actualAmount`), es mekkora az elteres
 * (`difference` = actual - expected; negativ = hiany, pozitiv = tobblet).
 *
 * A zaras **nem** modositja a rendeleseket es a fizeteseket: csak egy
 * pillanatkep az egyeztetesrol, igy ugyanarra a napra tobb zaras is
 * rogzitheto (pl. delelotti es delutani muszak).
 */
const cashClosingRepository = {
  ...base,

  /**
   * @param {{ restaurantId: string, dateFrom: string, dateTo: string,
   *           expectedAmount: number, actualAmount: number,
   *           closedByUserId: string|null, note?: string,
   *           closedAt?: string }} input
   */
  async createClosing(input) {
    if (!input.restaurantId) {
      throw new Error('[cashClosings] Az etterem azonositoja kotelezo.');
    }
    if (!input.dateFrom || !input.dateTo) {
      throw new Error('[cashClosings] Az idoszak ket vegpontja kotelezo.');
    }

    const expectedAmount = Math.round(Number(input.expectedAmount) || 0);
    const actualAmount = Math.round(Number(input.actualAmount) || 0);

    return base.insert({
      restaurantId: input.restaurantId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      expectedAmount,
      actualAmount,
      // Szandekosan tarolt (nem szamolt) mezo: a zaras pillanatanak
      // dokumentuma, ami kesobb sem valtozhat meg.
      difference: actualAmount - expectedAmount,
      closedByUserId: input.closedByUserId || null,
      closedAt: input.closedAt || new Date().toISOString(),
      note: input.note || ''
    });
  },

  /** Egy etterem zarasai, legujabb elol. */
  getByRestaurant(restaurantId) {
    return base
      .findBy('restaurantId', restaurantId)
      .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
  },

  /** Zarasok, amelyek zarasi idopontja az adott idoszakba esik. */
  getBetween(restaurantId, from, to) {
    const start = new Date(from);
    const end = new Date(to);
    return cashClosingRepository.getByRestaurant(restaurantId).filter((closing) => {
      const closedAt = new Date(closing.closedAt);
      return closedAt >= start && closedAt <= end;
    });
  },

  /** A legutobbi zaras, vagy null. */
  getLatest(restaurantId) {
    return cashClosingRepository.getByRestaurant(restaurantId)[0] || null;
  }
};

module.exports = cashClosingRepository;
