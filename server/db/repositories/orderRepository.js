const { createRepository } = require('./baseRepository');
const orderItemRepository = require('./orderItemRepository');
const {
  COLLECTIONS,
  ORDER_TYPE,
  ORDER_STATUS,
  PAYMENT_STATUS
} = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.ORDERS);

const VALID_TYPES = Object.values(ORDER_TYPE);
const VALID_STATUSES = Object.values(ORDER_STATUS);

/** Lezart allapotok - ezek mar nem szamitanak nyitott rendelesnek. */
const CLOSED_STATUSES = [ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED];

/** A vendegblokkon megjeleno rendelesi azonosito hossza. */
const RECEIPT_NUMBER_LENGTH = 6;

/**
 * Egyedi, RECEIPT_NUMBER_LENGTH jegyu rendelesi azonosito.
 *
 * A rendeles letrehozasakor kapja meg, es utana nem valtozik: igy a blokk
 * ujranyomtatasakor is ugyanaz az azonosito jelenik meg. Az utkozest ellenorzi;
 * ha a veletlen szam foglalt, ujra probal (egyetlen folyamat, alacsony
 * darabszam mellett ez gyakorlatilag sosem fordul elo).
 */
function generateReceiptNumber() {
  const min = 10 ** (RECEIPT_NUMBER_LENGTH - 1);
  const max = 10 ** RECEIPT_NUMBER_LENGTH - 1;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = String(Math.floor(min + Math.random() * (max - min + 1)));
    if (!base.find((order) => order.receiptNumber === candidate)) return candidate;
  }

  // Vegso esetben az ido also jegyeibol: rovid marad, es nem akad be a ciklus.
  return String(Date.now()).slice(-RECEIPT_NUMBER_LENGTH);
}

/**
 * Rendelesek. Helyben fogyasztasnal tableId mutat az asztalra,
 * online rendelesnel tableId = null es waiterId = null.
 */
const orderRepository = {
  ...base,

  /**
   * @param {{ restaurantId: string, tableId?: string|null, type?: string,
   *           waiterId?: string|null, status?: string, guestName?: string|null,
   *           receiptNumber?: string, createdAt?: string }} input
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
      // Online rendelesnel a vendeg neve - ebbol tudja a pincer, kihez tartozik.
      guestName: input.guestName || null,
      status,
      // Fizetettsegi allapot - szandekosan kulon a status eletciklustol.
      paymentStatus: PAYMENT_STATUS.UNPAID,
      // A blokk azonositoja mar itt eldol, hogy nyomtataskor ne valtozzon.
      receiptNumber: input.receiptNumber || generateReceiptNumber(),
      createdAt: input.createdAt || new Date().toISOString()
    });
  },

  /** Rendeles keresese a blokk azonositoja alapjan. */
  findByReceiptNumber(restaurantId, receiptNumber) {
    return base.find(
      (order) => order.restaurantId === restaurantId && order.receiptNumber === receiptNumber
    );
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
module.exports.RECEIPT_NUMBER_LENGTH = RECEIPT_NUMBER_LENGTH;
