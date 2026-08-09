const {
  restaurantRepository,
  tableRepository,
  orderRepository,
  orderItemRepository,
  menuItemRepository,
  extraRepository,
  userRepository
} = require('../db/repositories');
const { NotFoundError, ConflictError } = require('../utils/validation');
const { ORDER_ITEM_STATUS, DEFAULT_RECEIPT_FOOTER } = require('../../shared/constants');

/**
 * Vendegblokk adatai nyomtatashoz.
 *
 * A blokk teljes tartalmat egyetlen valaszban adja vissza, hogy a nyomtatasi
 * nezet egy keresbol dolgozhasson: etterem alapadatok (4. szegmens), a
 * kiszolgalo pincer, a rendeles azonositoja, a tetelek, az osszesites es a
 * kiallitas idopontja.
 *
 * Ket dolog szandekosan nem kerul a blokkra:
 *   - a konyhai / vendeg kommentek (a vendeget nem erdekli, a blokk rovidebb),
 *   - a tetelek allapota (a blokk pillanataban mar mind kiszolgalt).
 *
 * Csak a repository interfeszen keresztul er adatot.
 */

/**
 * Az arak ertelmezese: az etlapon szereplo ar a **netto** egysegar, az AFA es a
 * szervizdij erre rakodik ra. A blokk igy a
 *
 *     reszosszeg (netto) + AFA + szervizdij = vegosszeg
 *
 * sorrendet mutatja. Az AFA es a szervizdij kulcsat az admin allitja
 * (`restaurants.vatRate`, `restaurants.serviceFeeRate`, szazalekban); a
 * szervizdij alapja a netto reszosszeg.
 */
function calculateTotals(subtotal, restaurant) {
  const vatRate = Number(restaurant.vatRate) || 0;
  const serviceFeeRate = Number(restaurant.serviceFeeRate) || 0;

  // Forintra kerekitve, hogy a kinyomtatott sorok pontosan kiadjak a vegosszeget.
  const vatAmount = Math.round((subtotal * vatRate) / 100);
  const serviceFeeAmount = Math.round((subtotal * serviceFeeRate) / 100);

  return {
    subtotal,
    vatRate,
    vatAmount,
    serviceFeeRate,
    serviceFeeAmount,
    total: subtotal + vatAmount + serviceFeeAmount
  };
}

/** Egy tetel a blokkon: mennyiseg, egysegar, tetelosszeg, kulon soros extrak. */
function toReceiptItem(item) {
  const menuItem = menuItemRepository.findById(item.menuItemId);
  const unitPrice = menuItem ? menuItem.price : 0;

  // Nev szerint rendezve, hogy a blokk ugyanarrol a tetelrol mindig ugyanabban
  // a sorrendben keszuljon (ujranyomtataskor is).
  const extras = extraRepository
    .getByIds(item.extraIds)
    .sort((a, b) => a.name.localeCompare(b.name, 'hu'))
    .map((extra) => ({
      name: extra.name,
      price: extra.price,
      // Az extra is annyiszor szamit, ahany adag keszult.
      lineTotal: extra.price * item.quantity
    }));

  const lineTotal = unitPrice * item.quantity;

  return {
    name: menuItem ? menuItem.name : '(törölt tétel)',
    quantity: item.quantity,
    unitPrice,
    lineTotal,
    extras,
    // A tetel teljes osszege az extrakkal egyutt - ebbol all ossze a reszosszeg.
    itemTotal: lineTotal + extras.reduce((total, extra) => total + extra.lineTotal, 0)
  };
}

/**
 * A blokk adatcsomagja.
 *
 * @param {string} restaurantId
 * @param {string} orderId
 * @param {Date} [issuedAt] a kiallitas idopontja (alapertelmezes: most)
 * @throws {NotFoundError} ha a rendeles nem az etteremhez tartozik
 * @throws {ConflictError} ha meg van ki nem szolgalt tetel
 */
function getReceipt(restaurantId, orderId, issuedAt = new Date()) {
  const order = orderRepository.findById(orderId);
  if (!order || order.restaurantId !== restaurantId) {
    throw new NotFoundError('A rendelés nem található.');
  }

  const restaurant = restaurantRepository.findById(restaurantId);
  if (!restaurant) throw new NotFoundError('Az étterem adatai nem találhatók.');

  const items = orderItemRepository.getByOrder(order.id);

  // A blokk csak lezart asztalrol keszulhet: amig keszul vagy kint van etel,
  // a vegosszeg meg valtozhat.
  const pending = items.filter((item) => item.status !== ORDER_ITEM_STATUS.SERVED);
  if (!items.length || pending.length) {
    throw new ConflictError(
      'A blokk csak akkor nyomtatható, ha a rendelés minden tétele kiszolgálásra került.',
      'order_not_served',
      { itemCount: items.length, notServedCount: pending.length }
    );
  }

  const receiptItems = items
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(toReceiptItem);

  const subtotal = receiptItems.reduce((total, item) => total + item.itemTotal, 0);
  const table = order.tableId ? tableRepository.findById(order.tableId) : null;
  const waiter = order.waiterId ? userRepository.findById(order.waiterId) : null;

  return {
    restaurant: {
      name: restaurant.name || '',
      address: restaurant.address || '',
      phone: restaurant.phone || '',
      vatRate: Number(restaurant.vatRate) || 0,
      serviceFeeRate: Number(restaurant.serviceFeeRate) || 0,
      apCode: restaurant.apCode || '',
      receiptFooterMessage: restaurant.receiptFooterMessage || DEFAULT_RECEIPT_FOOTER
    },
    order: {
      id: order.id,
      receiptNumber: order.receiptNumber || '',
      tableLabel: table ? table.label : null,
      waiterName: waiter ? waiter.name : null,
      createdAt: order.createdAt
    },
    items: receiptItems,
    totals: calculateTotals(subtotal, restaurant),
    issuedAt: issuedAt.toISOString()
  };
}

module.exports = { getReceipt, calculateTotals };
