const { createRepository } = require('./baseRepository');
const { COLLECTIONS, ORDER_ITEM_STATUS } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.ORDER_ITEMS);

const VALID_STATUSES = Object.values(ORDER_ITEM_STATUS);

/**
 * Rendelesi tetelek. Az extrakra kapcsolotabla helyett kozvetlen id tomb
 * (extraIds) hivatkozik, mivel JSON tarolasnal nincs SQL join.
 */
const orderItemRepository = {
  ...base,

  /**
   * @param {{ orderId: string, menuItemId: string, quantity?: number,
   *           comment?: string, extraIds?: string[], status?: string }} input
   */
  async addItem(input) {
    const status = input.status || ORDER_ITEM_STATUS.PENDING;
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`[orderItems] Ismeretlen allapot: ${status}`);
    }

    return base.insert({
      orderId: input.orderId,
      menuItemId: input.menuItemId,
      quantity: input.quantity ?? 1,
      comment: input.comment || '',
      extraIds: input.extraIds || [],
      status,
      servedAt: null
    });
  },

  /** Tobb tetel felvetele egy mentessel (pl. teljes rendeles rogzitese). */
  async addItems(orderId, items) {
    return base.insertMany(
      items.map((item) => ({
        orderId,
        menuItemId: item.menuItemId,
        quantity: item.quantity ?? 1,
        comment: item.comment || '',
        extraIds: item.extraIds || [],
        status: item.status || ORDER_ITEM_STATUS.PENDING,
        servedAt: null
      }))
    );
  },

  /** Egy rendeles tetelei. */
  getByOrder(orderId) {
    return base.findBy('orderId', orderId);
  },

  /** Tobb rendeles tetelei egyben. */
  getByOrderIds(orderIds) {
    const ids = new Set(orderIds);
    return base.filter((item) => ids.has(item.orderId));
  },

  /** Adott allapotu tetelek (pl. a konyhai sorhoz: pending + preparing). */
  getByStatus(status, orderIds = null) {
    const ids = orderIds ? new Set(orderIds) : null;
    return base.filter((item) => item.status === status && (!ids || ids.has(item.orderId)));
  },

  /**
   * Tetel allapotanak modositasa. `served` eseten a servedAt automatikusan kitoltodik.
   * @returns {Promise<object|null>}
   */
  async updateOrderItemStatus(orderItemId, status) {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`[orderItems] Ismeretlen allapot: ${status} (${VALID_STATUSES.join(', ')})`);
    }

    const patch = { status };
    patch.servedAt = status === ORDER_ITEM_STATUS.SERVED ? new Date().toISOString() : null;
    return base.update(orderItemId, patch);
  },

  /** Egy rendeles osszes tetelenek allapota egyszerre. */
  async updateStatusByOrder(orderId, status) {
    const items = orderItemRepository.getByOrder(orderId);
    const updated = [];
    for (const item of items) {
      updated.push(await orderItemRepository.updateOrderItemStatus(item.id, status));
    }
    return updated.filter(Boolean);
  },

  /** Mennyiseg vagy megjegyzes modositasa (kiszolgalas elott). */
  async updateItem(orderItemId, { quantity, comment, extraIds }) {
    const patch = {};
    if (quantity !== undefined) patch.quantity = quantity;
    if (comment !== undefined) patch.comment = comment;
    if (extraIds !== undefined) patch.extraIds = extraIds;
    return base.update(orderItemId, patch);
  },

  /** Egy rendeles teteleinek torlese (rendeles torlesekor). */
  async removeByOrder(orderId) {
    return base.removeWhere((item) => item.orderId === orderId);
  },

  /** Igaz, ha a rendeles minden tetele kiszolgalt. */
  isOrderFullyServed(orderId) {
    const items = orderItemRepository.getByOrder(orderId);
    return items.length > 0 && items.every((item) => item.status === ORDER_ITEM_STATUS.SERVED);
  }
};

module.exports = orderItemRepository;
