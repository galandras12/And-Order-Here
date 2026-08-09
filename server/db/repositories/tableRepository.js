const { createRepository } = require('./baseRepository');
const { COLLECTIONS } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.TABLES);

/**
 * Asztalok az asztalterkephez: pozicio, meret, elforgatas.
 * A koordinatak a terkep vaszonan ertendok (pixel vagy racs egyseg).
 */
const tableRepository = {
  ...base,

  /**
   * @param {{ restaurantId: string, label: string, posX?: number, posY?: number,
   *           rotation?: number, width?: number, height?: number, comment?: string }} input
   */
  async createTable(input) {
    return base.insert({
      restaurantId: input.restaurantId,
      label: input.label,
      posX: input.posX ?? 0,
      posY: input.posY ?? 0,
      rotation: input.rotation ?? 0,
      width: input.width ?? 80,
      height: input.height ?? 80,
      comment: input.comment || ''
    });
  },

  /** Egy etterem asztalai. */
  getByRestaurant(restaurantId) {
    return base.findBy('restaurantId', restaurantId);
  },

  /** Asztal keresese felirat alapjan (pl. "A1"). */
  getByLabel(restaurantId, label) {
    return base.find((table) => table.restaurantId === restaurantId && table.label === label);
  },

  /** Asztal athelyezese / atmeretezese a terkepen. */
  async updatePosition(tableId, { posX, posY, rotation, width, height }) {
    const patch = {};
    if (posX !== undefined) patch.posX = posX;
    if (posY !== undefined) patch.posY = posY;
    if (rotation !== undefined) patch.rotation = rotation;
    if (width !== undefined) patch.width = width;
    if (height !== undefined) patch.height = height;
    return base.update(tableId, patch);
  }
};

module.exports = tableRepository;
