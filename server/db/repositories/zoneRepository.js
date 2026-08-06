const { createRepository } = require('./baseRepository');
const { COLLECTIONS } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.ZONES);

/**
 * Zonak (terasz, emelet, kulonterem) az asztalterkepen.
 * A shapeCoordinates egy sokszog pontjainak tombje: [{ x, y }, ...].
 */
const zoneRepository = {
  ...base,

  /**
   * @param {{ restaurantId: string, label: string, shapeCoordinates?: Array<{x:number,y:number}> }} input
   */
  async createZone(input) {
    return base.insert({
      restaurantId: input.restaurantId,
      label: input.label,
      shapeCoordinates: input.shapeCoordinates || []
    });
  },

  /** Egy etterem zonai. */
  getByRestaurant(restaurantId) {
    return base.findBy('restaurantId', restaurantId);
  },

  /** A zona alakjanak modositasa. */
  async updateShape(zoneId, shapeCoordinates) {
    return base.update(zoneId, { shapeCoordinates });
  }
};

module.exports = zoneRepository;
