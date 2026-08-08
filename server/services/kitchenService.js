const {
  tableRepository,
  orderRepository,
  orderItemRepository,
  menuItemRepository,
  menuCategoryRepository,
  extraRepository
} = require('../db/repositories');
const orderService = require('./orderService');
const {
  NotFoundError,
  ConflictError,
  createValidator
} = require('../utils/validation');
const {
  ORDER_TYPE,
  ORDER_STATUS,
  ORDER_ITEM_STATUS,
  MENU_CATEGORY_KIND
} = require('../../shared/constants');

/**
 * Konyhai munkapult.
 *
 * A szakacs csak azokat a teteleket latja, amelyek etel kategoriaba tartoznak
 * (a kategoria `kind` mezoje alapjan, nem a nevere szurve): az italokkal es az
 * egyeb tetelekkel a konyhan nincs teendo.
 *
 * A tetelek asztalonkent (rendelesenkent) egy-egy blokkba kerulnek. Az online
 * rendeles ugyanolyan blokk, mint barmelyik asztale: a valaszban nincs semmi,
 * amibol latszana, hogy online rendelesrol van szo - a szakacsnak ez nem
 * informacio, csak zaj.
 *
 * Minden adat a repository interfeszen keresztul jon.
 */

/** Ezekhez a rendelesekhez mar nincs teendo a konyhan. */
const CLOSED_STATUSES = [ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED];

/** A szakacs csak ezekbe az allapotokba lephet - a kiszolgalas a pincere. */
const KITCHEN_STATUSES = [ORDER_ITEM_STATUS.PREPARING, ORDER_ITEM_STATUS.READY];

/**
 * Az allapotok sorrendje. A tomeges leptetes csak elore lephet: a "Mind
 * indítása" nem teheti vissza a mar elkeszult tetelt a tuzhelyre. Egy tetelt
 * kulon, egyesevel vissza lehet lepetni, ha a szakacs elkattintotta.
 */
const STATUS_RANK = {
  [ORDER_ITEM_STATUS.PENDING]: 0,
  [ORDER_ITEM_STATUS.PREPARING]: 1,
  [ORDER_ITEM_STATUS.READY]: 2,
  [ORDER_ITEM_STATUS.SERVED]: 3
};

/* --------------------------------------------------------------- munkapult */

/** Az etel kategoriak azonositoi - ezek tetelei kerulnek a konyhai sorba. */
function foodCategoryIds(restaurantId) {
  return new Set(
    menuCategoryRepository
      .getByKind(restaurantId, MENU_CATEGORY_KIND.FOOD)
      .map((category) => category.id)
  );
}

/** Percben eltelt ido egy idobelyeg ota (null, ha nincs idobelyeg). */
function minutesSince(iso, now) {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - new Date(iso)) / 60000));
}

/**
 * Egy tetel konyhai kepe: nev, mennyiseg, extrak, komment, allapot es a
 * keszites kezdete. Ar nincs benne - a konyhan nincs ra szukseg.
 */
function toKitchenItem(item, now) {
  const menuItem = menuItemRepository.findById(item.menuItemId);
  const extras = extraRepository.getByIds(item.extraIds);

  return {
    id: item.id,
    orderId: item.orderId,
    name: menuItem ? menuItem.name : '(törölt tétel)',
    quantity: item.quantity,
    extras: extras.map((extra) => ({ id: extra.id, name: extra.name })),
    comment: item.comment || '',
    status: item.status,
    createdAt: item.createdAt,
    preparingStartedAt: item.preparingStartedAt || null,
    // A felulet percenkent ujraszamolja, de az elso megjelenites igy azonnal jo.
    preparingMinutes: minutesSince(item.preparingStartedAt, now),
    waitingMinutes: minutesSince(item.createdAt, now)
  };
}

/**
 * Blokk felirata.
 *
 * Helyben fogyasztasnal az asztal jelolese; online rendelesnel egy semleges,
 * ugyanolyan formatumu kod (R-01), amibol nem derul ki a rendeles tipusa. A
 * sorszam naponta indul ujra, hogy rovid maradjon.
 */
function blockLabel(order, onlineIndexes) {
  if (order.type !== ORDER_TYPE.ONLINE) {
    const table = order.tableId ? tableRepository.findById(order.tableId) : null;
    return table ? table.label : '—';
  }
  return `R-${String(onlineIndexes.get(order.id) || 1).padStart(2, '0')}`;
}

/**
 * Az online rendelesek napi sorszamai: rendeles id -> sorszam.
 * Igy a felirat egy napon belul stabil, es nem no vegtelenre.
 */
function onlineDailyIndexes(restaurantId, now) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const indexes = new Map();
  orderRepository
    .getOnlineOrders(restaurantId)
    .filter((order) => new Date(order.createdAt) >= dayStart)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .forEach((order, index) => indexes.set(order.id, index + 1));

  return indexes;
}

function countByStatus(items) {
  const counts = { pending: 0, preparing: 0, ready: 0, served: 0 };
  items.forEach((item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
  });
  return counts;
}

/**
 * A konyhai munkapult tartalma.
 *
 * Csak azok a rendelesek kerulnek bele, amelyekben van meg ki nem szolgalt
 * etel. A mar kiszolgalt etelek a blokkban maradnak (halvanyitva jelennek meg),
 * hogy a szakacs lassa, mi ment ki - de amint az utolso tetel is kiment, a
 * blokk elfogy a nezetbol.
 *
 * @param {string} restaurantId
 * @param {Date} [now]
 * @returns {{ blocks: object[], counts: object, generatedAt: string }}
 */
function getBoard(restaurantId, now = new Date()) {
  const foodIds = foodCategoryIds(restaurantId);
  const onlineIndexes = onlineDailyIndexes(restaurantId, now);

  const blocks = orderRepository
    .getActiveOrders(restaurantId)
    .filter((order) => !CLOSED_STATUSES.includes(order.status))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((order) => {
      const items = orderItemRepository
        .getByOrder(order.id)
        .filter((item) => {
          const menuItem = menuItemRepository.findById(item.menuItemId);
          return menuItem && foodIds.has(menuItem.categoryId);
        })
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .map((item) => toKitchenItem(item, now));

      return {
        orderId: order.id,
        label: blockLabel(order, onlineIndexes),
        createdAt: order.createdAt,
        waitingMinutes: minutesSince(order.createdAt, now),
        items,
        counts: countByStatus(items)
      };
    })
    // Amiben nincs etel, vagy mar minden etel kiment, annak nincs helye a
    // konyhai sorban.
    .filter((block) => block.items.some((item) => item.status !== ORDER_ITEM_STATUS.SERVED));

  const counts = { pending: 0, preparing: 0, ready: 0, served: 0 };
  blocks.forEach((block) => {
    Object.keys(counts).forEach((key) => {
      counts[key] += block.counts[key] || 0;
    });
  });

  return { blocks, counts, generatedAt: now.toISOString() };
}

/* --------------------------------------------------------- allapotvaltas */

/** Konyhai allapot ellenorzese: a szakacs nem szolgalhat ki tetelt. */
function validateKitchenStatus(status) {
  if (KITCHEN_STATUSES.includes(status)) return status;

  const validator = createValidator();
  validator.fail(
    'status',
    `A konyha csak "${KITCHEN_STATUSES.join('" vagy "')}" állapotot állíthat.`
  );
  validator.throwIfInvalid('A tétel állapota hibás.');
  return status;
}

/**
 * Egy tetel leptetese: leadva -> keszul, illetve keszul -> elkeszult.
 *
 * A tenyleges mentes es az `order_item:status_changed` esemeny az
 * orderService-ben tortenik - igy a konyhai es a pinceri ag ugyanazon az egy
 * uzleti logikan megy keresztul.
 *
 * @returns {Promise<{ item: object, changed: boolean }>}
 */
async function setItemStatus(restaurantId, orderItemId, status) {
  validateKitchenStatus(status);

  const item = orderItemRepository.findById(orderItemId);
  if (!item) throw new NotFoundError('A tétel nem található.');
  if (item.status === ORDER_ITEM_STATUS.SERVED) {
    throw new ConflictError(
      'A tétel már ki lett szolgálva, nem állítható vissza.',
      'item_already_served',
      { itemId: item.id }
    );
  }

  const result = await orderService.updateItemStatus(restaurantId, orderItemId, status);
  const updated = orderItemRepository.findById(orderItemId);

  return { item: toKitchenItem(updated, new Date()), changed: result.changed };
}

/**
 * Egy blokk (rendeles) teteleinek leptetese egyszerre.
 *
 * Csak az etel tetelekre hat, es csak elore lep: a mar tovabb tartok (elkeszult,
 * kiszolgalt) valtozatlanok maradnak. Az `itemIds` megadasaval szukiteni lehet,
 * melyik tetelek valtozzanak.
 *
 * @param {string} restaurantId
 * @param {string} orderId
 * @param {string} status
 * @param {string[]} [itemIds]
 * @returns {Promise<{ items: object[], count: number }>}
 */
async function setItemsStatus(restaurantId, orderId, status, itemIds = null) {
  validateKitchenStatus(status);

  const order = orderRepository.findById(orderId);
  if (!order || order.restaurantId !== restaurantId) {
    throw new NotFoundError('A rendelés nem található.');
  }
  if (CLOSED_STATUSES.includes(order.status)) {
    throw new ConflictError('A rendelés már lezárult.', 'order_closed');
  }

  const wanted = Array.isArray(itemIds) && itemIds.length ? new Set(itemIds) : null;
  const foodIds = foodCategoryIds(restaurantId);

  const targets = orderItemRepository.getByOrder(orderId).filter((item) => {
    if (wanted && !wanted.has(item.id)) return false;
    // Csak elore: a mar elkeszult (es a kiszolgalt) tetel nem esik vissza.
    if (STATUS_RANK[item.status] >= STATUS_RANK[status]) return false;

    const menuItem = menuItemRepository.findById(item.menuItemId);
    return menuItem && foodIds.has(menuItem.categoryId);
  });

  const updated = [];
  for (const item of targets) {
    await orderService.updateItemStatus(restaurantId, item.id, status);
    const fresh = orderItemRepository.findById(item.id);
    if (fresh) updated.push(toKitchenItem(fresh, new Date()));
  }

  return { items: updated, count: updated.length };
}

module.exports = {
  KITCHEN_STATUSES,
  getBoard,
  setItemStatus,
  setItemsStatus,
  toKitchenItem
};
