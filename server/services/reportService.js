const {
  restaurantRepository,
  orderRepository,
  orderItemRepository,
  menuCategoryRepository,
  menuItemRepository,
  userRepository
} = require('../db/repositories');
const receiptService = require('./receiptService');
const dateRange = require('../utils/dateRange');
const { NotFoundError, createValidator, trimmed, toNumber } = require('../utils/validation');
const { ORDER_STATUS } = require('../../shared/constants');

/**
 * Vezetoi riportok es statisztikak.
 *
 * Negy kerdesre valaszol:
 *   A) mi fogy a legjobban,
 *   B) mikor van a legnagyobb forgalom (napszakonkent),
 *   C) hogyan teljesitenek a pincerek,
 *   D) mennyi ido alatt keszul el egy-egy etel a konyhan.
 *
 * **Nincs kulon riport-tabla.** Minden szam a mar meglevo `orders`,
 * `orderItems`, `menuItems` es `users` kollekciokbol szamolodik ki, a lekerdezes
 * pillanataban, a repository retegen keresztul. Ezen az adatmennyisegen ez
 * gyorsabb es egyszerubb, mint elore szamolt osszesitoket karbantartani - es
 * nem tud elavulni.
 *
 * ---------------------------------------------------------------------------
 * Ket dontes, ami minden riportra ervenyes:
 *
 *   - A **sztornozott** (`cancelled`) rendelesek mindenhonnan kimaradnak: nem
 *     fogytak el, nem hoztak bevetelt, es a konyhai idejuk sem ervenyes.
 *   - A **bevetel brutto**: ugyanaz a szam, amit a vendeg fizet, es amit a
 *     blokk, illetve a logisztikai osszesito mutat. A szamitas a
 *     `receiptService.calculateTotals`-bol jon, hogy egyetlen helyen legyen
 *     definialva. Az AFA- es szervizdij-kulcs az etterem **aktualis** beallitasa
 *     - egy kulcsvaltoztatas tehat visszamenoleg is atszamolja a regi
 *     idoszakokat. Ez tudatos: a rendszer nem tarol kulcs-tortenetet.
 * ---------------------------------------------------------------------------
 *
 * Teljesitmeny: minden riport eloszor **idoszakra szur a repository retegben**
 * (`orderRepository.getBetween`, `orderItemRepository.getBetween`), es csak a
 * talalatokhoz tolti be a kapcsolodo rekordokat (`getByIds`). Egy heti riport
 * igy nem olvassa vegig a teljes historikus adatot, es a szuresi logika
 * valtozatlanul atviheto egy SQL WHERE feltetelbe.
 */

/** Alapertelmezett idoszak, ha a keres nem ad datumot: az elmult 7 nap. */
const DEFAULT_DAYS = 7;

/** A legnepszerubb tetelek listajanak alapertelmezett es maximalis hossza. */
const DEFAULT_TOP_LIMIT = 10;
const MAX_TOP_LIMIT = 100;

const CANCELLED = ORDER_STATUS.CANCELLED;

/* ------------------------------------------------------------- kozos */

/** Az idoszak feloldasa a kozos szabalyokkal, 7 napos alapertelmezessel. */
function resolveRange(query = {}, validator = createValidator()) {
  return dateRange.resolveRange(query, { defaultDays: DEFAULT_DAYS, validator });
}

function requireRestaurant(restaurantId) {
  const restaurant = restaurantRepository.findById(restaurantId);
  if (!restaurant) throw new NotFoundError('Az étterem adatai nem találhatók.');
  return restaurant;
}

/**
 * Netto osszeg -> brutto (AFA + szervizdij), a blokkal azonos szamitassal.
 *
 * Az osszevonas mindig a **teljes** netto osszegre tortenik, nem tetelenkent:
 * igy a kerekites egyszer fut le, es a riport osszege pontosan kiadja azt, amit
 * a blokkok osszege.
 */
function toGross(netAmount, restaurant) {
  return receiptService.calculateTotals(Math.round(netAmount), restaurant).total;
}

/**
 * Az etterem etlapja gyors kereseshez: tetel id -> nev, ar, kategoria.
 *
 * Egyben ez adja az etteremhez tartozas ellenorzeset is (a `menuItems` rekord a
 * kategorian keresztul kapcsolodik az etteremhez).
 */
function menuCatalog(restaurantId) {
  const categories = menuCategoryRepository.getByRestaurant(restaurantId);
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const items = new Map();
  for (const item of menuItemRepository.getByCategoryIds(categories.map((c) => c.id))) {
    const category = categoryById.get(item.categoryId);
    items.set(item.id, {
      id: item.id,
      name: item.name,
      price: item.price,
      categoryId: item.categoryId,
      categoryName: category ? category.name : null
    });
  }

  return { categories, categoryById, items };
}

/**
 * Az idoszakban leadott tetelek, a sajat ettermunkre szukitve.
 *
 * Elobb a tetelekre szurunk idoszak szerint, es csak a talalatok rendeleseit
 * toltjuk be - igy nem kell vegigolvasni az osszes rendelest.
 */
function loadSoldItems(restaurantId, range) {
  const itemsInRange = orderItemRepository.getBetween(range.from, range.to);
  if (!itemsInRange.length) return { items: [], orderById: new Map() };

  const orderById = new Map(
    orderRepository
      .getByIds(new Set(itemsInRange.map((item) => item.orderId)))
      .filter((order) => order.restaurantId === restaurantId && order.status !== CANCELLED)
      .map((order) => [order.id, order])
  );

  return {
    items: itemsInRange.filter((item) => orderById.has(item.orderId)),
    orderById
  };
}

/** Az idoszakban felvett, ele rendelesek. */
function loadOrders(restaurantId, range) {
  return orderRepository
    .getBetween(restaurantId, range.from, range.to)
    .filter((order) => order.status !== CANCELLED);
}

/** Egy tetel netto sorosszege (egysegar x mennyiseg). Extra nelkul. */
function netLineTotal(item, catalog) {
  const menuItem = catalog.items.get(item.menuItemId);
  return (menuItem ? menuItem.price : 0) * item.quantity;
}

/** Opcionalis kategoria-szuro ellenorzese. */
function validateCategoryId(categoryId, catalog, validator) {
  if (!categoryId) return null;
  if (!catalog.categoryById.has(categoryId)) {
    validator.fail('categoryId', 'Ismeretlen kategória.');
    return null;
  }
  return categoryId;
}

/* ------------------------------------------- A) legnepszerubb tetelek */

/**
 * Legnepszerubb etelek / italok: menutetelenkent az eladott mennyiseg es a
 * bevetel, csokkeno sorrendben.
 *
 * @param {string} restaurantId
 * @param {{ dateFrom?, dateTo?, categoryId?, limit? }} query
 */
function getTopItems(restaurantId, query = {}) {
  const restaurant = requireRestaurant(restaurantId);
  const validator = createValidator();
  const range = resolveRange(query, validator);
  const catalog = menuCatalog(restaurantId);

  const categoryId = validateCategoryId(trimmed(query.categoryId), catalog, validator);
  const limit = Math.min(
    MAX_TOP_LIMIT,
    Math.max(1, Math.floor(toNumber(query.limit, DEFAULT_TOP_LIMIT)) || DEFAULT_TOP_LIMIT)
  );
  validator.throwIfInvalid('A riport paraméterei hibásak.');

  const { items } = loadSoldItems(restaurantId, range);

  const rows = new Map();
  for (const item of items) {
    const menuItem = catalog.items.get(item.menuItemId);
    // Torolt etlap tetel: a rendelesi sor megmarad, de mar nincs mihez kotni.
    if (!menuItem) continue;
    if (categoryId && menuItem.categoryId !== categoryId) continue;

    if (!rows.has(menuItem.id)) {
      rows.set(menuItem.id, {
        menuItemId: menuItem.id,
        name: menuItem.name,
        categoryId: menuItem.categoryId,
        categoryName: menuItem.categoryName,
        unitPrice: menuItem.price,
        quantity: 0,
        orderCount: 0,
        netRevenue: 0,
        orderIds: new Set()
      });
    }

    const row = rows.get(menuItem.id);
    row.quantity += item.quantity;
    row.netRevenue += netLineTotal(item, catalog);
    row.orderIds.add(item.orderId);
  }

  const all = Array.from(rows.values())
    .map((row) => ({
      menuItemId: row.menuItemId,
      name: row.name,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      unitPrice: row.unitPrice,
      quantity: row.quantity,
      // Hany kulon rendelesben szerepelt - ez mutatja, mennyire szeles korben
      // nepszeru (nem csak egy nagy rendeles vitte fel).
      orderCount: row.orderIds.size,
      revenue: toGross(row.netRevenue, restaurant)
    }))
    // Darabszam szerint csokkenoen; azonos darabszamnal a nagyobb bevetel elore.
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue
      || a.name.localeCompare(b.name, 'hu'));

  return {
    range,
    categoryId: categoryId || null,
    limit,
    itemCount: all.length,
    totals: {
      quantity: all.reduce((sum, row) => sum + row.quantity, 0),
      revenue: all.reduce((sum, row) => sum + row.revenue, 0)
    },
    items: all.slice(0, limit)
  };
}

/* ------------------------------------------ B) forgalmi csucsidoszakok */

/**
 * Oraankenti bontas: hany rendeles erkezett es mennyi bevetelt hozott.
 *
 * Az ora a rendeles felvetelenek **helyi ido** szerinti oraja - a beosztas
 * tervezesehez ez a hasznalhato ertek.
 */
function getPeakHours(restaurantId, query = {}) {
  const restaurant = requireRestaurant(restaurantId);
  const range = resolveRange(query);
  const catalog = menuCatalog(restaurantId);

  const orders = loadOrders(restaurantId, range);
  const itemsByOrder = new Map();
  for (const item of orderItemRepository.getByOrderIds(orders.map((order) => order.id))) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId).push(item);
  }

  // Mind a 24 ora szerepel, akkor is, ha ures - kulonben az oszlopdiagram
  // tengelye osszecsuszna, es nem latszana a zarva tartas.
  const hours = Array.from({ length: 24 }, (unused, hour) => ({
    hour,
    orderCount: 0,
    itemCount: 0,
    netRevenue: 0
  }));

  for (const order of orders) {
    const bucket = hours[new Date(order.createdAt).getHours()];
    bucket.orderCount += 1;

    for (const item of itemsByOrder.get(order.id) || []) {
      bucket.itemCount += item.quantity;
      bucket.netRevenue += netLineTotal(item, catalog);
    }
  }

  const rows = hours.map((bucket) => ({
    hour: bucket.hour,
    // Cimke a diagramhoz: "18:00"
    label: `${String(bucket.hour).padStart(2, '0')}:00`,
    orderCount: bucket.orderCount,
    itemCount: bucket.itemCount,
    revenue: toGross(bucket.netRevenue, restaurant)
  }));

  const busiest = rows.reduce(
    (best, row) => (row.orderCount > (best ? best.orderCount : 0) ? row : best),
    null
  );

  return {
    range,
    hours: rows,
    totals: {
      orderCount: rows.reduce((sum, row) => sum + row.orderCount, 0),
      revenue: rows.reduce((sum, row) => sum + row.revenue, 0)
    },
    // Null, ha az idoszakban egyaltalan nem volt rendeles.
    busiestHour: busiest && busiest.orderCount > 0 ? busiest : null
  };
}

/* --------------------------------------- C) pincerenkenti teljesitmeny */

/**
 * Egy rendeles lezarasi ideje percben: a felvetel es az **utolso** tetel
 * kiszolgalasa kozott eltelt ido.
 *
 * Csak akkor ertelmes, ha a rendeles minden tetelet kiszolgaltak - egy meg
 * nyitott asztal ideje folyamatosan nőne, es elhuzna az atlagot.
 *
 * @returns {number|null} percben, vagy null, ha a rendeles meg nem zarult le
 */
function completionMinutes(order, items) {
  if (!items.length) return null;
  if (!items.every((item) => item.servedAt)) return null;

  const lastServed = items.reduce(
    (latest, item) => Math.max(latest, new Date(item.servedAt).getTime()),
    0
  );
  const minutes = (lastServed - new Date(order.createdAt).getTime()) / 60000;
  return minutes >= 0 ? minutes : null;
}

/**
 * Pincerenkenti teljesitmeny: kiszolgalt rendelesek, bevetel, atlagos
 * lezarasi ido.
 *
 * Az online rendelesek kimaradnak: nincs hozzajuk pincer (`waiterId: null`),
 * igy senkinek a teljesitmenyet nem irjak le.
 */
function getWaiterPerformance(restaurantId, query = {}) {
  const restaurant = requireRestaurant(restaurantId);
  const range = resolveRange(query);
  const catalog = menuCatalog(restaurantId);

  const orders = loadOrders(restaurantId, range).filter((order) => order.waiterId);
  const itemsByOrder = new Map();
  for (const item of orderItemRepository.getByOrderIds(orders.map((order) => order.id))) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId).push(item);
  }

  const rows = new Map();
  for (const order of orders) {
    if (!rows.has(order.waiterId)) {
      const user = userRepository.findById(order.waiterId);
      rows.set(order.waiterId, {
        waiterId: order.waiterId,
        // Torolt fiok eseten is maradjon beszedes a sor.
        name: user ? user.name : '(törölt felhasználó)',
        orderCount: 0,
        itemCount: 0,
        netRevenue: 0,
        completedCount: 0,
        totalMinutes: 0
      });
    }

    const row = rows.get(order.waiterId);
    const items = itemsByOrder.get(order.id) || [];

    row.orderCount += 1;
    for (const item of items) {
      row.itemCount += item.quantity;
      row.netRevenue += netLineTotal(item, catalog);
    }

    const minutes = completionMinutes(order, items);
    if (minutes !== null) {
      row.completedCount += 1;
      row.totalMinutes += minutes;
    }
  }

  const waiters = Array.from(rows.values())
    .map((row) => {
      const revenue = toGross(row.netRevenue, restaurant);
      return {
        waiterId: row.waiterId,
        name: row.name,
        orderCount: row.orderCount,
        itemCount: row.itemCount,
        revenue,
        avgOrderValue: row.orderCount ? Math.round(revenue / row.orderCount) : 0,
        // Hany rendelesbol szamolt az atlag - enelkul egyetlen elfelejtett
        // asztal is felreertheto szamot adna.
        completedCount: row.completedCount,
        avgCompletionMinutes: row.completedCount
          ? roundMinutes(row.totalMinutes / row.completedCount)
          : null
      };
    })
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'hu'));

  return {
    range,
    waiters,
    totals: {
      orderCount: waiters.reduce((sum, row) => sum + row.orderCount, 0),
      revenue: waiters.reduce((sum, row) => sum + row.revenue, 0),
      completedCount: waiters.reduce((sum, row) => sum + row.completedCount, 0)
    }
  };
}

/* -------------------------------------- D) konyhai elkeszitesi idok */

/** Egy tetel elkeszitesi ideje percben, vagy null, ha nem merheto. */
function preparationMinutes(item) {
  if (!item.preparingStartedAt || !item.readyAt) return null;
  const minutes =
    (new Date(item.readyAt).getTime() - new Date(item.preparingStartedAt).getTime()) / 60000;
  return minutes >= 0 ? minutes : null;
}

/**
 * Percben mert ertek kerekitese.
 *
 * Ket tizedes: valos konyhai idoknel (percek) ez boven eleg, egy perc alatti
 * ertekeknel viszont megmarad a masodperces felbontas - a felulet abbol tud
 * "45 mp"-et kiirni "0 perc" helyett.
 */
function roundMinutes(value) {
  return Math.round(value * 100) / 100;
}

/** Atlag egy percekbol allo listara. */
function average(values) {
  if (!values.length) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return roundMinutes(sum / values.length);
}

/**
 * Atlagos konyhai elkeszitesi ido tetelenkent es kategorianként.
 *
 * A minta a `preparingStartedAt` es a `readyAt` kozotti ido. Csak azok a tetelek
 * szamitanak, amelyeknel **mindket** idobelyeg megvan: a 14. szegmens elott
 * felvett tetelekhez nincs `readyAt` (nem allithato helyre), es a meg keszulo
 * tetel ideje sem vegleges. A valasz `missingSampleCount` mezoje megmutatja,
 * hany eladott tetel maradt igy ki - igy latszik, mennyire megbizhato az atlag.
 */
function getKitchenTimes(restaurantId, query = {}) {
  requireRestaurant(restaurantId);
  const validator = createValidator();
  const range = resolveRange(query, validator);
  const catalog = menuCatalog(restaurantId);

  const categoryId = validateCategoryId(trimmed(query.categoryId), catalog, validator);
  const menuItemId = trimmed(query.menuItemId);
  if (menuItemId && !catalog.items.has(menuItemId)) {
    validator.fail('menuItemId', 'Ismeretlen menütétel.');
  }
  validator.throwIfInvalid('A riport paraméterei hibásak.');

  const { items } = loadSoldItems(restaurantId, range);

  const rows = new Map();
  let missingSampleCount = 0;

  for (const item of items) {
    const menuItem = catalog.items.get(item.menuItemId);
    if (!menuItem) continue;
    if (categoryId && menuItem.categoryId !== categoryId) continue;
    if (menuItemId && menuItem.id !== menuItemId) continue;

    const minutes = preparationMinutes(item);
    if (minutes === null) {
      missingSampleCount += 1;
      continue;
    }

    if (!rows.has(menuItem.id)) {
      rows.set(menuItem.id, {
        menuItemId: menuItem.id,
        name: menuItem.name,
        categoryId: menuItem.categoryId,
        categoryName: menuItem.categoryName,
        samples: []
      });
    }
    rows.get(menuItem.id).samples.push(minutes);
  }

  const itemRows = Array.from(rows.values())
    .map((row) => ({
      menuItemId: row.menuItemId,
      name: row.name,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      sampleCount: row.samples.length,
      avgMinutes: average(row.samples),
      minMinutes: roundMinutes(Math.min(...row.samples)),
      maxMinutes: roundMinutes(Math.max(...row.samples))
    }))
    // A leglassabb tetel legyen elol: azt kell optimalizalni.
    .sort((a, b) => b.avgMinutes - a.avgMinutes || b.sampleCount - a.sampleCount);

  const byCategory = new Map();
  for (const row of rows.values()) {
    const key = row.categoryId || 'unknown';
    if (!byCategory.has(key)) {
      byCategory.set(key, {
        categoryId: row.categoryId,
        categoryName: row.categoryName || '(nincs kategória)',
        samples: []
      });
    }
    byCategory.get(key).samples.push(...row.samples);
  }

  const categoryRows = Array.from(byCategory.values())
    .map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      sampleCount: row.samples.length,
      avgMinutes: average(row.samples)
    }))
    .sort((a, b) => b.avgMinutes - a.avgMinutes);

  const allSamples = itemRows.reduce((total, row) => total + row.sampleCount, 0);

  return {
    range,
    categoryId: categoryId || null,
    menuItemId: menuItemId || null,
    items: itemRows,
    categories: categoryRows,
    overall: {
      sampleCount: allSamples,
      avgMinutes: average(Array.from(rows.values()).flatMap((row) => row.samples))
    },
    // Hany eladott tetelhez nem tartozott meresi adat (regi tetel vagy meg keszul).
    missingSampleCount
  };
}

/* ------------------------------------------------------------ szurok */

/**
 * A riportok szuroihez tartozo valaszthato ertekek: kategoriak es tetelek.
 * Egy keresbol feltoltheto minden legordulo.
 */
function getFilterOptions(restaurantId) {
  requireRestaurant(restaurantId);
  const catalog = menuCatalog(restaurantId);

  return {
    categories: catalog.categories
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((category) => ({ id: category.id, name: category.name, kind: category.kind })),
    menuItems: Array.from(catalog.items.values())
      .map((item) => ({ id: item.id, name: item.name, categoryId: item.categoryId }))
      .sort((a, b) => a.name.localeCompare(b.name, 'hu'))
  };
}

module.exports = {
  DEFAULT_DAYS,
  DEFAULT_TOP_LIMIT,
  MAX_TOP_LIMIT,
  resolveRange,
  getTopItems,
  getPeakHours,
  getWaiterPerformance,
  getKitchenTimes,
  getFilterOptions
};
