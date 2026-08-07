const {
  tableRepository,
  orderRepository,
  orderItemRepository,
  menuItemRepository,
  menuCategoryRepository,
  extraRepository,
  userRepository
} = require('../db/repositories');
const { emitOrderCreated, emitOrderItemsAdded } = require('../sockets/emitters');
const {
  NotFoundError,
  ConflictError,
  createValidator,
  trimmed,
  toNumber
} = require('../utils/validation');
const { ORDER_TYPE, ORDER_STATUS, ORDER_ITEM_STATUS } = require('../../shared/constants');

/**
 * Rendelesfelvetel a pinceri feluletrol.
 *
 * Csak a repository interfeszen keresztul er adatot. Itt vannak az uzleti
 * szabalyok is: egy asztalhoz nem nyitunk parhuzamos rendelest, a tetelek a
 * meglevo nyitott rendeleshez adodnak, es minden uj tetel `pending` allapotban
 * indul.
 */

const MAX_QUANTITY = 99;
const MAX_ITEMS_PER_SUBMIT = 50;

/** Lezart allapotok - ezekhez mar nem lehet tetelt adni. */
const CLOSED_STATUSES = [ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED];

/* ------------------------------------------------------------------- menu */

/**
 * A pinceri rendelesfelvetel etlapja: kategoriak, elerheto tetelek, extrak.
 * A 4. szegmensben felvitt admin adatokat olvassa, csak isAvailable tetelekkel.
 */
function getMenu(restaurantId) {
  const categories = menuCategoryRepository.getByRestaurant(restaurantId);
  const categoryIds = categories.map((category) => category.id);

  const items = menuItemRepository
    .getByCategoryIds(categoryIds)
    .filter((item) => item.isAvailable)
    .sort((a, b) => a.name.localeCompare(b.name, 'hu'));

  return {
    categories,
    items,
    extras: extraRepository
      .getByRestaurant(restaurantId)
      .sort((a, b) => a.name.localeCompare(b.name, 'hu'))
  };
}

/* --------------------------------------------------------------- nezetek */

/** Pincer nev az id alapjan - a "ki adta le" megjeleniteshez. */
function waiterNameOf(waiterId) {
  if (!waiterId) return null;
  const user = userRepository.findById(waiterId);
  return user ? user.name : null;
}

/**
 * Egy rendeles teljes, megjelenitesre kesz kepe: feloldott tetelnevek, arak,
 * extrak, a leado pincer neve es a leadas ideje.
 */
function toOrderView(order) {
  if (!order) return null;

  const items = orderItemRepository.getByOrder(order.id).map((item) => {
    const menuItem = menuItemRepository.findById(item.menuItemId);
    const extras = extraRepository.getByIds(item.extraIds);
    const unitPrice = (menuItem ? menuItem.price : 0) +
      extras.reduce((total, extra) => total + (extra.price || 0), 0);

    return {
      id: item.id,
      menuItemId: item.menuItemId,
      // A tetel neve a rendeles idejen ervenyes etlapbol jon; ha a tetelt
      // kesobb toroltek, legalabb az id latszik.
      name: menuItem ? menuItem.name : '(törölt tétel)',
      basePrice: menuItem ? menuItem.price : 0,
      quantity: item.quantity,
      comment: item.comment || '',
      extras: extras.map((extra) => ({ id: extra.id, name: extra.name, price: extra.price })),
      unitPrice,
      lineTotal: unitPrice * item.quantity,
      status: item.status,
      servedAt: item.servedAt || null,
      createdAt: item.createdAt || order.createdAt,
      waiterId: item.waiterId || order.waiterId || null,
      waiterName: waiterNameOf(item.waiterId || order.waiterId)
    };
  });

  const table = order.tableId ? tableRepository.findById(order.tableId) : null;

  return {
    id: order.id,
    restaurantId: order.restaurantId,
    tableId: order.tableId,
    tableLabel: table ? table.label : null,
    type: order.type,
    status: order.status,
    createdAt: order.createdAt,
    waiterId: order.waiterId,
    waiterName: waiterNameOf(order.waiterId),
    items: items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    total: items.reduce((total, item) => total + item.lineTotal, 0)
  };
}

/** Az asztal nyitott rendelese (ha van), megjelenitesre kesz formaban. */
function getOpenOrderForTable(restaurantId, tableId) {
  const table = tableRepository.findById(tableId);
  if (!table || table.restaurantId !== restaurantId) {
    throw new NotFoundError('Az asztal nem található.');
  }

  const open = orderRepository.getOpenOrdersByTable(tableId);
  // Egy asztalhoz egyszerre egy nyitott rendelest tartunk; ha tobb lenne
  // (korabbi adat), a legregebbi az "elo" rendeles.
  const order = open.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] || null;

  return { table, order: toOrderView(order) };
}

/** Egy konkret rendeles (pl. online rendeles a terkep auto ikonjarol). */
function getOrder(restaurantId, orderId) {
  const order = orderRepository.findById(orderId);
  if (!order || order.restaurantId !== restaurantId) {
    throw new NotFoundError('A rendelés nem található.');
  }
  return toOrderView(order);
}

/** A meg fel nem dolgozott online rendelesek, megjelenitesre kesz formaban. */
function listOpenOnlineOrders(restaurantId) {
  return orderRepository
    .getOnlineOrders(restaurantId)
    .filter((order) => !CLOSED_STATUSES.includes(order.status))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(toOrderView);
}

/* ------------------------------------------------------------- leadas */

/** A kosar tetelek ellenorzese es normalizalasa. */
function validateItems(restaurantId, rawItems) {
  const validator = createValidator();

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    validator.fail('items', 'Legalább egy tételt adj hozzá a rendeléshez.');
    validator.throwIfInvalid('A rendelés adatai hibásak.');
  }
  if (rawItems.length > MAX_ITEMS_PER_SUBMIT) {
    validator.fail('items', `Egyszerre legfeljebb ${MAX_ITEMS_PER_SUBMIT} tétel adható le.`);
  }

  const categoryIds = new Set(
    menuCategoryRepository.getByRestaurant(restaurantId).map((category) => category.id)
  );
  const extraIds = new Set(extraRepository.getByRestaurant(restaurantId).map((extra) => extra.id));

  const items = rawItems.map((raw, index) => {
    const field = `items[${index}]`;
    const menuItem = menuItemRepository.findById(raw && raw.menuItemId);

    if (!menuItem || !categoryIds.has(menuItem.categoryId)) {
      validator.fail(field, 'Ismeretlen menütétel.');
    } else if (!menuItem.isAvailable) {
      validator.fail(field, `A(z) "${menuItem.name}" jelenleg nem elérhető.`);
    }

    const quantity = toNumber(raw && raw.quantity, 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      validator.fail(field, `A mennyiség 1 és ${MAX_QUANTITY} között lehet.`);
    }

    const comment = trimmed(raw && raw.comment);
    if (comment.length > 200) validator.fail(field, 'A megjegyzés legfeljebb 200 karakter lehet.');

    const chosenExtras = Array.isArray(raw && raw.extraIds) ? [...new Set(raw.extraIds)] : [];
    const unknownExtra = chosenExtras.find((id) => !extraIds.has(id));
    if (unknownExtra) validator.fail(field, 'Ismeretlen kiegészítő.');

    return {
      menuItemId: raw && raw.menuItemId,
      quantity,
      comment,
      extraIds: chosenExtras,
      status: ORDER_ITEM_STATUS.PENDING
    };
  });

  validator.throwIfInvalid('A rendelés adatai hibásak.');
  return items;
}

/**
 * Rendeles leadasa.
 *
 * - asztalhoz: ha van nyitott rendeles, ahhoz adjuk a teteleket, kulonben uj
 *   dine_in rendeles jon letre a bejelentkezett pincerrel,
 * - meglevo rendeleshez (orderId): oda kerulnek a tetelek (pl. online rendeles
 *   kiegeszitese).
 *
 * @param {string} restaurantId
 * @param {string} waiterId a bejelentkezett pincer
 * @param {{ tableId?: string, orderId?: string, items: object[] }} input
 * @returns {Promise<{ order: object, addedItems: object[], created: boolean }>}
 */
async function submitOrder(restaurantId, waiterId, input = {}) {
  const items = validateItems(restaurantId, input.items);

  let order = null;
  let created = false;

  if (input.orderId) {
    const existing = orderRepository.findById(input.orderId);
    if (!existing || existing.restaurantId !== restaurantId) {
      throw new NotFoundError('A rendelés nem található.');
    }
    if (CLOSED_STATUSES.includes(existing.status)) {
      throw new ConflictError('A rendelés már lezárult, nem bővíthető.', 'order_closed');
    }
    order = existing;
  } else if (input.tableId) {
    const table = tableRepository.findById(input.tableId);
    if (!table || table.restaurantId !== restaurantId) {
      throw new NotFoundError('Az asztal nem található.');
    }

    // Nem nyitunk parhuzamos rendelest ugyanahhoz az asztalhoz.
    const open = orderRepository
      .getOpenOrdersByTable(table.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    if (open.length) {
      order = open[0];
    } else {
      order = await orderRepository.createOrder({
        restaurantId,
        tableId: table.id,
        type: ORDER_TYPE.DINE_IN,
        waiterId,
        status: ORDER_STATUS.NEW
      });
      created = true;
    }
  } else {
    const validator = createValidator();
    validator.fail('tableId', 'Asztal vagy meglévő rendelés megadása kötelező.');
    validator.throwIfInvalid('A rendelés adatai hibásak.');
  }

  const addedItems = await orderItemRepository.addItems(
    order.id,
    items.map((item) => ({ ...item, waiterId }))
  );

  // Uj rendelesnel order:created, meglevohoz adaskor order_item:added megy ki -
  // mindketto a konyhat is erteseti, hogy van mit keszitenie.
  if (created) {
    emitOrderCreated(order, addedItems);
  } else {
    emitOrderItemsAdded(order, addedItems);
  }

  return { order: toOrderView(order), addedItems, created };
}

module.exports = {
  MAX_QUANTITY,
  MAX_ITEMS_PER_SUBMIT,
  getMenu,
  getOpenOrderForTable,
  getOrder,
  listOpenOnlineOrders,
  submitOrder,
  toOrderView
};
