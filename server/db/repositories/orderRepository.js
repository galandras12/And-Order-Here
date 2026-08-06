const { createRepository } = require('./baseRepository');
const orderItemRepository = require('./orderItemRepository');
const { COLLECTIONS, ORDER_TYPE, ORDER_STATUS } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.ORDERS);

const VALID_TYPES = Object.values(ORDER_TYPE);
const VALID_STATUSES = Object.values(ORDER_STATUS);

/** Lezart allapotok - ezek mar nem szamitanak nyitott rendelesnek. */
const CLOSED_STATUSES = [ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED];

/**
 * Rendelesek. Helyben fogyasztasnal tableId mutat az asztalra,
 * online rendelesnel tableId = null es waiterId = null.
 */
const orderRepository = {
  ...base,

  /**
   * @param {{ restaurantId: string, tableId?: string|null, type?: string,
   *           waiterId?: string|null, status?: string }} input
   */
  async createOrder(input) {
    const type = input.type || (input.tableId ? ORDER_TYPE.DINE_IN : ORDER_TYPE.ONLINE);
    if (!VALID_TYPES.includes(type)) {
      throw new Error(`[orders] Ismeretlen rendeles tipus: ${type}`);
    }

    const status = input.status || ORDER_STATUS.NEW;
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`[orders] Ismeretlen allapot: ${status}`);
    }
    if (type === ORDER_TYPE.DINE_IN && !input.tableId) {
      throw new Error('[orders] Helyben fogyasztashoz asztal (tableId) szukseges.');
    }

    return base.insert({
      restaurantId: input.restaurantId,
      tableId: type === ORDER_TYPE.ONLINE ? null : input.tableId,
      type,
      waiterId: input.waiterId || null,
      status,
      createdAt: input.createdAt || new Date().toISOString()
    });
  },

  /**
   * Rendeles letrehozasa tetelekkel egyutt.
   * @returns {Promise<{ order: object, items: object[] }>}
   */
  async createOrderWithItems(input, items = []) {
    const order = await orderRepository.createOrder(input);
    const created = items.length ? await orderItemRepository.addItems(order.id, items) : [];
    return { order, items: created };
  },

  /** Egy asztal rendelesei, legujabb elol. */
  getOrdersByTable(tableId) {
    return base
      .findBy('tableId', tableId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  /** Egy asztal nyitott (meg nem fizetett, nem sztornozott) rendelesei. */
  getOpenOrdersByTable(tableId) {
    return orderRepository
      .getOrdersByTable(tableId)
      .filter((order) => !CLOSED_STATUSES.includes(order.status));
  },

  /** Egy etterem rendelesei. */
  getByRestaurant(restaurantId) {
    return base.findBy('restaurantId', restaurantId);
  },

  /** Rendelesek allapot szerint. */
  getByStatus(restaurantId, status) {
    return base.filter((order) => order.restaurantId === restaurantId && order.status === status);
  },

  /** Minden nyitott rendeles (konyhai es pinceri nezetekhez). */
  getActiveOrders(restaurantId) {
    return base.filter(
      (order) => order.restaurantId === restaurantId && !CLOSED_STATUSES.includes(order.status)
    );
  },

  /** Online rendelesek. */
  getOnlineOrders(restaurantId) {
    return base.filter(
      (order) => order.restaurantId === restaurantId && order.type === ORDER_TYPE.ONLINE
    );
  },

  /** Egy pincer rendelesei. */
  getByWaiter(waiterId) {
    return base.findBy('waiterId', waiterId);
  },

  /** Rendelesek egy idoszakban (napi zaras, kimutatasok). */
  getBetween(restaurantId, from, to) {
    const start = new Date(from);
    const end = new Date(to);
    return base.filter((order) => {
      const created = new Date(order.createdAt);
      return order.restaurantId === restaurantId && created >= start && created <= end;
    });
  },

  /** Rendeles a teteleivel egyutt - a felsobb retegek ezt hasznaljak megjelenitesre. */
  getOrderWithItems(orderId) {
    const order = base.findById(orderId);
    if (!order) return null;
    return { ...order, items: orderItemRepository.getByOrder(orderId) };
  },

  /** Allapotvaltas (new -> accepted -> in_preparation -> ready -> served -> paid). */
  async updateStatus(orderId, status) {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`[orders] Ismeretlen allapot: ${status} (${VALID_STATUSES.join(', ')})`);
    }
    return base.update(orderId, { status });
  },

  /** Rendeles atadasa masik pincernek. */
  async assignWaiter(orderId, waiterId) {
    return base.update(orderId, { waiterId });
  },

  /** Rendeles athelyezese masik asztalra. */
  async moveToTable(orderId, tableId) {
    return base.update(orderId, { tableId });
  },

  /** Rendeles torlese a teteleivel egyutt. */
  async removeWithItems(orderId) {
    await orderItemRepository.removeByOrder(orderId);
    return base.remove(orderId);
  }
};

module.exports = orderRepository;
