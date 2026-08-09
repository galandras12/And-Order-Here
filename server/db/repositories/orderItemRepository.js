const { createRepository } = require('./baseRepository');
const { COLLECTIONS, ORDER_ITEM_STATUS } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.ORDER_ITEMS);

const VALID_STATUSES = Object.values(ORDER_ITEM_STATUS);

/**
 * Egy tetel rekord osszeallitasa.
 *
 * A waiterId es a createdAt tetel szinten is tarolodik, nem csak a rendelesen:
 * egy asztalhoz tobb korben, akar mas-mas pincer is adhat tetelt, es a
 * feluleten latszania kell, ki mit es mikor adott le.
 */
function buildItem(orderId, item, status) {
  return {
    orderId,
    menuItemId: item.menuItemId,
    quantity: item.quantity ?? 1,
    comment: item.comment || '',
    extraIds: item.extraIds || [],
    status,
    waiterId: item.waiterId || null,
    createdAt: item.createdAt || new Date().toISOString(),
    // Mikor kezdett keszulni - ebbol latszik a konyhan, mennyi ideje fo.
    preparingStartedAt: null,
    servedAt: null
  };
}

/**
 * Rendelesi tetelek. Az extrakra kapcsolotabla helyett kozvetlen id tomb
 * (extraIds) hivatkozik, mivel JSON tarolasnal nincs SQL join.
 */
const orderItemRepository = {
  ...base,

  /**
   * @param {{ orderId: string, menuItemId: string, quantity?: number,
   *           comment?: string, extraIds?: string[], status?: string,
   *           waiterId?: string, createdAt?: string }} input
   */
  async addItem(input) {
    const status = input.status || ORDER_ITEM_STATUS.PENDING;
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`[orderItems] Ismeretlen allapot: ${status}`);
    }

    return base.insert(buildItem(input.orderId, input, status));
  },

  /** Tobb tetel felvetele egy mentessel (pl. teljes rendeles rogzitese). */
  async addItems(orderId, items) {
    return base.insertMany(
      items.map((item) => buildItem(orderId, item, item.status || ORDER_ITEM_STATUS.PENDING))
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
   * Tetel allapotanak modositasa.
   *
   * Az idobelyegeket az allapot vezerli, hogy ne lehessenek ellentmondasban a
   * statusszal: `served`-nel a servedAt, `preparing`-nel a preparingStartedAt
   * toltodik ki, visszalepesnel (pending) pedig kiurul.
   *
   * @returns {Promise<object|null>}
   */
  async updateOrderItemStatus(orderItemId, status) {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`[orderItems] Ismeretlen allapot: ${status} (${VALID_STATUSES.join(', ')})`);
    }

    const now = new Date().toISOString();
    const patch = { status };
    patch.servedAt = status === ORDER_ITEM_STATUS.SERVED ? now : null;

    if (status === ORDER_ITEM_STATUS.PREPARING) {
      patch.preparingStartedAt = now;
    } else if (status === ORDER_ITEM_STATUS.PENDING) {
      // Visszatettek a sorba: a korabbi keszitesi ido mar nem ervenyes.
      patch.preparingStartedAt = null;
    }

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
