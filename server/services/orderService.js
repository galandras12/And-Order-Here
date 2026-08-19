const {
  tableRepository,
  orderRepository,
  orderItemRepository,
  menuItemRepository,
  menuCategoryRepository,
  extraRepository,
  userRepository
} = require('../db/repositories');
const menuService = require('./menuService');
const paymentService = require('./paymentService');
const {
  emitOrderCreated,
  emitOrderItemsAdded,
  emitOrderItemStatusChanged,
  emitOrderItemServed
} = require('../sockets/emitters');
const {
  NotFoundError,
  ConflictError,
  createValidator,
  trimmed,
  toNumber
} = require('../utils/validation');
const { ORDER_TYPE, ORDER_STATUS, ORDER_ITEM_STATUS } = require('../../shared/constants');

/**
 * Rendelesfelvetel es tetel-allapotkezeles a pinceri feluletrol.
 *
 * Csak a repository interfeszen keresztul er adatot. Itt vannak az uzleti
 * szabalyok is: egy asztalhoz nem nyitunk parhuzamos rendelest, a tetelek a
 * meglevo nyitott rendeleshez adodnak, minden uj tetel `pending` allapotban
 * indul, es kiszolgaltnak csak a mar elkeszult (`ready`) tetel jelolheto.
 */

const MAX_QUANTITY = 99;
const MAX_ITEMS_PER_SUBMIT = 50;

/** Lezart allapotok - ezekhez mar nem lehet tetelt adni. */
const CLOSED_STATUSES = [ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED];

const VALID_ITEM_STATUSES = Object.values(ORDER_ITEM_STATUS);

/* ------------------------------------------------------------------- menu */

/**
 * A pinceri rendelesfelvetel etlapja.
 *
 * Ugyanaz a fuggveny szolgalja ki az online vendegfeluletet is
 * (`menuService.getAvailableMenu`), hogy a ket helyen ne csuszhasson szet, mi
 * szamit elerheto tetelnek.
 */
function getMenu(restaurantId) {
  return menuService.getAvailableMenu(restaurantId);
}

/* --------------------------------------------------------------- nezetek */

/** Pincer nev az id alapjan - a "ki adta le" megjeleniteshez. */
function waiterNameOf(waiterId) {
  if (!waiterId) return null;
  const user = userRepository.findById(waiterId);
  return user ? user.name : null;
}

/**
 * Egy tetel megjelenitesre kesz kepe: feloldott nev, ar, extrak, allapot, es a
 * "ki adta le, mikor" adatok.
 *
 * @param {object} item a tarolt orderItem rekord
 * @param {object} [order] a szulo rendeles (a hianyzo mezok innen egeszulnek ki)
 */
function toItemView(item, order = null) {
  const menuItem = menuItemRepository.findById(item.menuItemId);
  const extras = extraRepository.getByIds(item.extraIds);
  const unitPrice = (menuItem ? menuItem.price : 0) +
    extras.reduce((total, extra) => total + (extra.price || 0), 0);

  const waiterId = item.waiterId || (order && order.waiterId) || null;

  return {
    id: item.id,
    orderId: item.orderId,
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
    createdAt: item.createdAt || (order ? order.createdAt : null),
    waiterId,
    waiterName: waiterNameOf(waiterId)
  };
}

/** Allapotonkenti darabszamok - a felulet ebbol csoportosit, nem szamol ujra. */
function countByStatus(items) {
  const counts = {};
  VALID_ITEM_STATUSES.forEach((status) => {
    counts[status] = 0;
  });
  items.forEach((item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
  });
  return counts;
}

/**
 * Egy rendeles teljes, megjelenitesre kesz kepe: feloldott tetelnevek, arak,
 * extrak, a leado pincer neve, a leadas ideje es az allapotok osszesitese.
 *
 * Az `allItemsServed` szandekosan itt, a szerveren dol el: a felulet ne
 * talalgassa a listabol, hogy nyomtathato-e mar a blokk.
 */
function toOrderView(order) {
  if (!order) return null;

  const items = orderItemRepository
    .getByOrder(order.id)
    .map((item) => toItemView(item, order));

  const table = order.tableId ? tableRepository.findById(order.tableId) : null;
  const statusCounts = countByStatus(items);

  return {
    id: order.id,
    restaurantId: order.restaurantId,
    tableId: order.tableId,
    tableLabel: table ? table.label : null,
    type: order.type,
    status: order.status,
    // A vendegblokkon is ez az azonosito jelenik meg.
    receiptNumber: order.receiptNumber || null,
    // Fizetettsegi allapot (12. szegmens) - a rendeles eletciklusatol fuggetlen.
    paymentStatus: order.paymentStatus || 'unpaid',
    createdAt: order.createdAt,
    waiterId: order.waiterId,
    waiterName: waiterNameOf(order.waiterId),
    items: items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    total: items.reduce((total, item) => total + item.lineTotal, 0),
    statusCounts,
    readyCount: statusCounts[ORDER_ITEM_STATUS.READY],
    servedCount: statusCounts[ORDER_ITEM_STATUS.SERVED],
    // Minden tetel kiszolgalva -> a blokk nyomtathato (10. szegmens).
    allItemsServed: items.length > 0 && items.every(
      (item) => item.status === ORDER_ITEM_STATUS.SERVED
    )
  };
}

/**
 * Rovid rendeles-kiseroadat a socket esemenyekhez.
 *
 * Igy a fogado felulet (pincer, kesobb konyha) a teljes rendeles ujratoltese
 * nelkul is tudja, melyik asztalrol van szo, es hogy elfogyott-e mar minden
 * tetel az asztalrol.
 */
function toOrderContext(order) {
  const table = order.tableId ? tableRepository.findById(order.tableId) : null;
  const items = orderItemRepository.getByOrder(order.id);

  return {
    id: order.id,
    restaurantId: order.restaurantId,
    tableId: order.tableId,
    tableLabel: table ? table.label : null,
    type: order.type,
    status: order.status,
    allItemsServed: items.length > 0 && items.every(
      (item) => item.status === ORDER_ITEM_STATUS.SERVED
    )
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

/**
 * A kosar tetelek ellenorzese es normalizalasa.
 *
 * A `validator` kivulrol is atadhato: igy az online leadasnal a vendeg neve es
 * a tetelek hibai egyszerre, egy valaszban jutnak vissza.
 */
function validateItems(restaurantId, rawItems, validator = createValidator()) {
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

/* ------------------------------------------------------ online leadas */

/**
 * A vendegnek visszaadott rendeles-kep.
 *
 * Szandekosan szukebb, mint a pinceri nezet: a vendeget a sajat tetelei, az
 * osszeg es a rendeles azonositoja erdekli - a belso allapotok, a pincer es az
 * asztal nem.
 */
function toGuestOrderView(order) {
  const items = orderItemRepository
    .getByOrder(order.id)
    .map((item) => toItemView(item, order))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return {
    id: order.id,
    receiptNumber: order.receiptNumber || null,
    guestName: order.guestName || '',
    createdAt: order.createdAt,
    items: items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      comment: item.comment,
      extras: item.extras.map((extra) => ({ name: extra.name, price: extra.price })),
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal
    })),
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    total: items.reduce((total, item) => total + item.lineTotal, 0)
  };
}

/**
 * Online rendeles leadasa a vendegfeluletrol - bejelentkezes nelkul.
 *
 * A rendeles `type: online`, `tableId: null`, `waiterId: null`, es a vendeg
 * neve a `guestName` mezobe kerul. Minden tetel `pending` allapotban indul, es
 * ugyanaz az `order:created` esemeny megy ki, mint a pinceri leadasnal - igy a
 * terkep auto ikonja (6. szegmens) es a konyhai munkapult (9. szegmens)
 * valtoztatas nelkul mukodik online rendelesre is.
 *
 * @param {string} restaurantId
 * @param {{ guestName: string, items: object[] }} input
 * @returns {Promise<{ order: object }>}
 */
async function submitOnlineOrder(restaurantId, input = {}) {
  const validator = createValidator();

  // TODO (16. szegmens - GDPR): e-mail / telefonszam bekerese es a hozza tartozo
  // adatkezelesi tajekoztato ott keszul el. Egyelore szandekosan csak a nevet
  // kerjuk be - annyit, amennyi a helyszini kiszolgalashoz kell.
  validator.requiredString('guestName', input.guestName, { max: 80 });
  const guestName = trimmed(input.guestName);
  if (guestName && guestName.length < 2) {
    validator.fail('guestName', 'A név legalább 2 karakter legyen.');
  }

  // A tetelek hibai ugyanebbe a validatorba gyulnek, hogy egy korben
  // visszakapja oket a vendeg.
  const items = validateItems(restaurantId, input.items, validator);

  const order = await orderRepository.createOrder({
    restaurantId,
    tableId: null,
    type: ORDER_TYPE.ONLINE,
    waiterId: null,
    status: ORDER_STATUS.NEW,
    guestName
  });

  const addedItems = await orderItemRepository.addItems(order.id, items);
  emitOrderCreated(order, addedItems);

  return { order: toGuestOrderView(order) };
}

/* -------------------------------------------------- tetel allapotvaltas */

/** Egy tetel a rendelesevel egyutt, etterem-ellenorzessel. */
function loadItem(restaurantId, orderItemId) {
  const item = orderItemRepository.findById(orderItemId);
  if (!item) throw new NotFoundError('A tétel nem található.');

  const order = orderRepository.findById(item.orderId);
  if (!order || order.restaurantId !== restaurantId) {
    throw new NotFoundError('A tétel nem található.');
  }
  return { item, order };
}

/**
 * Tetel allapotanak atallitasa.
 *
 * Ez az altalanos, allapotfuggetlen valtozat - a konyhai felulet (9. szegmens)
 * ezen keresztul fog `preparing` / `ready` allapotot allitani. A pinceri
 * felulet nem ezt hivja, hanem a `markItemServed`-et, ami csak kiszolgalast
 * enged: az elkeszulest a szakacs jelzi, nem a pincer.
 *
 * @param {string} restaurantId
 * @param {string} orderItemId
 * @param {string} status az ORDER_ITEM_STATUS egyik erteke
 * @returns {Promise<{ item: object, order: object, changed: boolean }>}
 */
async function updateItemStatus(restaurantId, orderItemId, status) {
  if (!VALID_ITEM_STATUSES.includes(status)) {
    const validator = createValidator();
    validator.fail('status', `Ismeretlen állapot: ${status}.`);
    validator.throwIfInvalid('A tétel állapota hibás.');
  }

  const { item, order } = loadItem(restaurantId, orderItemId);
  if (CLOSED_STATUSES.includes(order.status)) {
    throw new ConflictError('A rendelés már lezárult.', 'order_closed');
  }

  // Ugyanaz az allapot: nem irunk feleslegesen, es nem kuldunk esemenyt sem.
  if (item.status === status) {
    return { item: toItemView(item, order), order: toOrderView(order), changed: false };
  }

  const updated = await orderItemRepository.updateOrderItemStatus(orderItemId, status);
  const itemView = toItemView(updated, order);
  const context = toOrderContext(order);

  if (status === ORDER_ITEM_STATUS.SERVED) {
    emitOrderItemServed(restaurantId, itemView, context);
    // Ha ez volt az utolso kint levo tetel, es mar ki is fizettek, a rendeles
    // lezarul - igy szabadul fel az asztal a terkepen.
    await paymentService.closeIfSettled(restaurantId, order.id);
  } else {
    emitOrderItemStatusChanged(restaurantId, itemView, context);
  }

  return { item: itemView, order: toOrderView(order), changed: true };
}

/**
 * Kiszolgalas jelolese egy tetelen.
 *
 * Csak `ready` allapotu tetel jelolheto kiszolgaltnak: amig a konyha nem jelzi
 * az elkeszulest, nincs mit kivinni. A mar kiszolgalt tetel ujboli jelolese nem
 * hiba (a gomb ketszeri koppintasa vagy a tomeges jeloles utan is ertelmes
 * valaszt adunk), csak nem tortenik semmi.
 *
 * @returns {Promise<{ item: object, order: object, changed: boolean }>}
 */
async function markItemServed(restaurantId, orderItemId) {
  const { item, order } = loadItem(restaurantId, orderItemId);

  if (item.status === ORDER_ITEM_STATUS.SERVED) {
    return { item: toItemView(item, order), order: toOrderView(order), changed: false };
  }
  if (item.status !== ORDER_ITEM_STATUS.READY) {
    throw new ConflictError(
      'Csak elkészült tétel jelölhető kiszolgáltnak.',
      'item_not_ready',
      { itemId: item.id, status: item.status }
    );
  }

  return updateItemStatus(restaurantId, orderItemId, ORDER_ITEM_STATUS.SERVED);
}

/**
 * Egy rendeles osszes `ready` tetelenek kiszolgalasa egy lepesben
 * ("Mindet kiszolgáltam").
 *
 * Tetelenkent kuldi az `order_item:served` esemenyt, hogy a fogado feluletek
 * (es a 9. szegmens konyhai kepernyoje) egysegesen, tetelenkent kezeljek.
 *
 * @returns {Promise<{ order: object, items: object[], count: number }>}
 */
async function serveAllReady(restaurantId, orderId) {
  const order = orderRepository.findById(orderId);
  if (!order || order.restaurantId !== restaurantId) {
    throw new NotFoundError('A rendelés nem található.');
  }
  if (CLOSED_STATUSES.includes(order.status)) {
    throw new ConflictError('A rendelés már lezárult.', 'order_closed');
  }

  const ready = orderItemRepository
    .getByOrder(orderId)
    .filter((item) => item.status === ORDER_ITEM_STATUS.READY);

  const served = [];
  for (const item of ready) {
    const updated = await orderItemRepository.updateOrderItemStatus(
      item.id,
      ORDER_ITEM_STATUS.SERVED
    );
    served.push(toItemView(updated, order));
  }

  // Az esemenyek a mentesek utan mennek ki, hogy a kisero adatban (context)
  // mar a vegleges allapot legyen benne - kulonben az utolso tetel utan is
  // allItemsServed: false erkezne.
  const context = toOrderContext(order);
  served.forEach((item) => emitOrderItemServed(restaurantId, item, context));

  // Kifizetett rendelesnel az utolso kiszolgalt tetel lezarja a rendelest.
  if (served.length) await paymentService.closeIfSettled(restaurantId, order.id);

  return { order: toOrderView(order), items: served, count: served.length };
}

module.exports = {
  MAX_QUANTITY,
  MAX_ITEMS_PER_SUBMIT,
  getMenu,
  getOpenOrderForTable,
  getOrder,
  listOpenOnlineOrders,
  submitOrder,
  submitOnlineOrder,
  updateItemStatus,
  markItemServed,
  serveAllReady,
  toItemView,
  toOrderView,
  toGuestOrderView,
  toOrderContext
};
