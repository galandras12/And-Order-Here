const {
  orderRepository,
  orderItemRepository,
  paymentRepository,
  tableRepository,
  userRepository,
  cashClosingRepository
} = require('../db/repositories');
const receiptService = require('./receiptService');
const { NotFoundError, createValidator, trimmed, toNumber } = require('../utils/validation');
const dateRange = require('../utils/dateRange');
const {
  ROLES,
  ORDER_TYPE,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_METHODS,
  PAYMENT_STATUS
} = require('../../shared/constants');

/**
 * Logisztikai / adminisztrativ penzugyi attekinto.
 *
 * Harom feladata van:
 *   - napi/idoszaki forgalmi osszesito (bevetel, fizetesi mod szerinti bontas),
 *   - blokk-archivum: a korabbi rendelesek visszakeresese es ellenorzese,
 *   - napi kasszazaras: a vart es a leszamolt keszpenz egyeztetese.
 *
 * **Nem tarol uj penzugyi adatot.** Minden szam a mar meglevo `orders`,
 * `orderItems` es `payments` kollekciokbol szamolodik, a repository retegen
 * keresztul; az egyetlen uj kollekcio a `cashClosings`, ami magat az
 * egyeztetest (nem a forgalmat) dokumentalja.
 *
 * A vegosszegek a 10. szegmens `receiptService` logikajaval keszulnek, igy az
 * archivumban ugyanaz az osszeg jelenik meg, mint a kinyomtatott blokkon.
 *
 * ---------------------------------------------------------------------------
 * Az idoszak ket kulonbozo idobelyegre vonatkozik, szandekosan:
 *
 *   - a **penzugyi** szamok (bevetel, fizetesi mod szerinti bontas, kasszazaras)
 *     a fizetes idopontja (`payments.paidAt`) alapjan kerulnek az idoszakba -
 *     ez az, ami aznap tenylegesen befolyt,
 *   - a **darabszamok** (rendelesek tipus szerint, kifizetetlenek) a rendeles
 *     letrehozasa (`orders.createdAt`) alapjan - ez az, amit aznap felvettek.
 *
 * Egy elozo nap felvett, de ma kifizetett rendeles igy a mai bevetelben, de a
 * tegnapi rendelesszamban jelenik meg. A felulet mindket anker jelentesét
 * kiirja, hogy ne legyen felreertheto.
 * ---------------------------------------------------------------------------
 */

/** Lapozas alapertelmezesei. */
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

/**
 * A kasszaba fizikailag bekerulo penz fizetesi modjai.
 *
 * Az `atm_later` (utolagos ATM) is ide tartozik: a 12. szegmensben ez azt
 * jelenti, hogy a vendeg a helyszinen, keszpenz-helyettesitovel rendezi -
 * a kasszazarasnal tehat egyeztetni kell.
 */
const CASH_METHODS = [PAYMENT_METHOD.CASH, PAYMENT_METHOD.ATM_LATER];

/** Egy zaras beirhato legnagyobb osszege - elgepeles elleni vedelem. */
const MAX_CLOSING_AMOUNT = 100000000;

/** Fizetesi mod -> emberi cimke (a feluletek is ebbol epitkeznek). */
const METHOD_LABEL = PAYMENT_METHODS.reduce((map, method) => {
  map[method.key] = method.label;
  return map;
}, {});

/** Lezart, uzletileg mar nem szamito rendelesek. */
const CANCELLED = ORDER_STATUS.CANCELLED;

/* ------------------------------------------------------------ idoszak */

/**
 * Az idoszak feloldasa. A kozos `dateRange` seged vegzi, ugyanazokkal a
 * szabalyokkal, mint a vezetoi riportoknal - itt az alapertelmezes a mai nap.
 */
function resolveRange(query = {}, validator = createValidator()) {
  return dateRange.resolveRange(query, { validator });
}

/** Beleesik-e egy idobelyeg az idoszakba. */
function inRange(iso, range) {
  return dateRange.inRange(iso, range);
}

/* ------------------------------------------------------------- kozos */

/**
 * Az etterem rendelesei id szerinti terkepben - a fizetesek ezen keresztul
 * szurodnek a sajat etteremre (a `payments` rekordon nincs restaurantId).
 */
function ordersById(restaurantId) {
  return new Map(orderRepository.getByRestaurant(restaurantId).map((order) => [order.id, order]));
}

/** Egy etterem fizetesei az idoszakban, fizetesi ido szerint. */
function paymentsInRange(restaurantId, range, orderMap = ordersById(restaurantId)) {
  return paymentRepository
    .getBetween(range.from, range.to)
    .filter((payment) => orderMap.has(payment.orderId))
    .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
}

/** Fizetesek osszesitese modonkent, mindig mind az ot moddal (nullaval is). */
function summarizeByMethod(payments) {
  const totals = new Map(
    PAYMENT_METHODS.map((method) => [method.key, { method: method.key, label: method.label, amount: 0, count: 0 }])
  );

  for (const payment of payments) {
    // Ismeretlen (pl. kesobb bevezetett) mod se vesszen el az osszegzesbol.
    if (!totals.has(payment.method)) {
      totals.set(payment.method, {
        method: payment.method,
        label: METHOD_LABEL[payment.method] || payment.method,
        amount: 0,
        count: 0
      });
    }
    const row = totals.get(payment.method);
    row.amount += payment.amount;
    row.count += 1;
  }

  return Array.from(totals.values());
}

/** Egy rendeles vegosszege a blokkal azonos szamitassal. */
function totalOf(order) {
  return receiptService.getOrderTotals(order.restaurantId, order.id).totals.total;
}

/* --------------------------------------------------- A) forgalmi osszesito */

/**
 * Napi / idoszaki forgalmi osszesito.
 *
 * @param {string} restaurantId
 * @param {{ dateFrom?: string, dateTo?: string }} query
 */
function getSummary(restaurantId, query = {}) {
  const range = resolveRange(query);
  const orderMap = ordersById(restaurantId);

  // --- penz: a fizetes idopontja szerint ---
  const payments = paymentsInRange(restaurantId, range, orderMap);
  const byMethod = summarizeByMethod(payments);
  const revenue = payments.reduce((sum, payment) => sum + payment.amount, 0);

  const paidOrderIds = new Set(payments.map((payment) => payment.orderId));
  const settledOrderCount = Array.from(paidOrderIds).filter(
    (orderId) => (orderMap.get(orderId) || {}).paymentStatus === PAYMENT_STATUS.PAID
  ).length;

  // --- darabszamok: a rendeles felvetelenek idopontja szerint ---
  const createdOrders = Array.from(orderMap.values()).filter((order) =>
    inRange(order.createdAt, range)
  );
  const liveOrders = createdOrders.filter((order) => order.status !== CANCELLED);

  const orderCounts = {
    dineIn: liveOrders.filter((order) => order.type === ORDER_TYPE.DINE_IN).length,
    online: liveOrders.filter((order) => order.type === ORDER_TYPE.ONLINE).length,
    cancelled: createdOrders.length - liveOrders.length,
    total: liveOrders.length
  };

  // --- kifizetetlenek: figyelemfelhivas ---
  let unpaidCount = 0;
  let unpaidAmount = 0;
  for (const order of liveOrders) {
    if (order.paymentStatus === PAYMENT_STATUS.PAID) continue;
    const total = totalOf(order);
    // Ures rendelesen nincs mit behajtani - ne zajositsa a figyelmeztetest.
    if (total <= 0) continue;
    const paid = paymentRepository.getTotalPaid(order.id);
    unpaidCount += 1;
    unpaidAmount += Math.max(0, total - paid);
  }

  return {
    range,
    revenue: {
      total: revenue,
      paymentCount: payments.length,
      // Hany rendeles zarult le teljesen kifizetettkent az idoszaki fizetesekbol.
      settledOrderCount
    },
    byMethod,
    orderCounts,
    unpaid: { count: unpaidCount, amount: unpaidAmount }
  };
}

/* --------------------------------------------------------- B) archivum */

/** Egy sor a blokk-archivumban. */
function toArchiveRow(order, payments) {
  const total = totalOf(order);
  const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const table = order.tableId ? tableRepository.findById(order.tableId) : null;
  const waiter = order.waiterId ? userRepository.findById(order.waiterId) : null;

  // Modonkent osszevonva: egy rendelest tobb reszletben, tobb modon is
  // fizethetnek (12. szegmens).
  const methods = [];
  for (const payment of payments) {
    const existing = methods.find((row) => row.method === payment.method);
    if (existing) {
      existing.amount += payment.amount;
      existing.count += 1;
    } else {
      methods.push({
        method: payment.method,
        label: METHOD_LABEL[payment.method] || payment.method,
        amount: payment.amount,
        count: 1
      });
    }
  }

  return {
    id: order.id,
    receiptNumber: order.receiptNumber || null,
    createdAt: order.createdAt,
    type: order.type,
    status: order.status,
    tableId: order.tableId,
    tableLabel: table ? table.label : null,
    guestName: order.guestName || null,
    waiterId: order.waiterId,
    waiterName: waiter ? waiter.name : null,
    itemCount: orderItemRepository
      .getByOrder(order.id)
      .reduce((sum, item) => sum + item.quantity, 0),
    total,
    paidAmount,
    dueAmount: Math.max(0, total - paidAmount),
    paymentStatus: order.paymentStatus || PAYMENT_STATUS.UNPAID,
    paymentMethods: methods,
    lastPaidAt: payments.length ? payments[payments.length - 1].paidAt : null
  };
}

/**
 * Blokk-archivum: szurheto, lapozhato rendeleslista.
 *
 * @param {string} restaurantId
 * @param {{ dateFrom?, dateTo?, tableId?, waiterId?, paymentMethod?,
 *           paymentStatus?, type?, page?, limit? }} query
 */
function listOrders(restaurantId, query = {}) {
  const validator = createValidator();
  const range = resolveRange(query, validator);

  const type = trimmed(query.type);
  if (type && !Object.values(ORDER_TYPE).includes(type)) {
    validator.fail('type', 'Ismeretlen rendelés típus.');
  }

  const paymentStatus = trimmed(query.paymentStatus);
  if (paymentStatus && !Object.values(PAYMENT_STATUS).includes(paymentStatus)) {
    validator.fail('paymentStatus', 'Ismeretlen fizetettségi állapot.');
  }

  const paymentMethod = trimmed(query.paymentMethod);
  if (paymentMethod && !Object.values(PAYMENT_METHOD).includes(paymentMethod)) {
    validator.fail('paymentMethod', 'Ismeretlen fizetési mód.');
  }

  const page = Math.max(1, Math.floor(toNumber(query.page, 1)) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(toNumber(query.limit, DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE)
  );

  validator.throwIfInvalid('A szűrés paraméterei hibásak.');

  const tableId = trimmed(query.tableId);
  const waiterId = trimmed(query.waiterId);

  // A fizeteseket egyszer toltjuk be, es rendelesenkent csoportositjuk: igy a
  // szures es a sorok osszeallitasa is egy olvasasbol dolgozik.
  const paymentsByOrder = new Map();
  for (const payment of paymentRepository.all()) {
    if (!paymentsByOrder.has(payment.orderId)) paymentsByOrder.set(payment.orderId, []);
    paymentsByOrder.get(payment.orderId).push(payment);
  }
  for (const list of paymentsByOrder.values()) {
    list.sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
  }

  const matching = orderRepository
    .getByRestaurant(restaurantId)
    .filter((order) => inRange(order.createdAt, range))
    .filter((order) => !type || order.type === type)
    .filter((order) => !tableId || order.tableId === tableId)
    .filter((order) => !waiterId || order.waiterId === waiterId)
    .filter(
      (order) =>
        !paymentStatus || (order.paymentStatus || PAYMENT_STATUS.UNPAID) === paymentStatus
    )
    .filter(
      (order) =>
        !paymentMethod ||
        (paymentsByOrder.get(order.id) || []).some((payment) => payment.method === paymentMethod)
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const totalCount = matching.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / limit));
  const start = (page - 1) * limit;

  // A vegosszeg tetelekbol szamolodik, ezert csak az eppen megjelenitett
  // oldalra szamoljuk ki.
  const orders = matching
    .slice(start, start + limit)
    .map((order) => toArchiveRow(order, paymentsByOrder.get(order.id) || []));

  return {
    range,
    filters: { type: type || null, tableId: tableId || null, waiterId: waiterId || null,
      paymentMethod: paymentMethod || null, paymentStatus: paymentStatus || null },
    page,
    limit,
    totalCount,
    pageCount,
    orders
  };
}

/**
 * Egy rendeles reszletes, utolagosan ellenorizheto nezete.
 *
 * A blokk ugyanazzal a `receiptService` sablonnal keszul, mint a nyomtatott
 * valtozat - itt viszont a kiszolgalasi feltetel nelkul, mert az archivumban
 * egy meg le nem zart rendelest is meg kell tudni nezni.
 */
function getOrderDetail(restaurantId, orderId) {
  const order = orderRepository.findById(orderId);
  if (!order || order.restaurantId !== restaurantId) {
    throw new NotFoundError('A rendelés nem található.');
  }

  const payments = paymentRepository
    .getByOrder(order.id)
    .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));

  return {
    order: toArchiveRow(order, payments),
    receipt: receiptService.getReceiptView(restaurantId, orderId),
    payments: payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      label: METHOD_LABEL[payment.method] || payment.method,
      amount: payment.amount,
      paidAt: payment.paidAt
    }))
  };
}

/**
 * Az archivum szuroihez tartozo valaszthato ertekek (asztalok, pincerek).
 * Egy keresbol feltoltheto a szuro urlap.
 */
function getFilterOptions(restaurantId) {
  return {
    tables: tableRepository
      .findBy('restaurantId', restaurantId)
      .map((table) => ({ id: table.id, label: table.label }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), 'hu', { numeric: true })),
    waiters: userRepository
      .findBy('restaurantId', restaurantId)
      .filter((user) => user.role === ROLES.WAITER)
      .map((user) => ({ id: user.id, name: user.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'hu')),
    paymentMethods: PAYMENT_METHODS.map((method) => ({ key: method.key, label: method.label }))
  };
}

/* ----------------------------------------------------- C) napi kasszazaras */

/**
 * A rendszer altal vart keszpenz-egyenleg egy idoszakra.
 *
 * A `cash` es `atm_later` modon **rogzitett** fizetesekbol szamol. Szandekosan
 * a fizetesekbol es nem a "teljesen kifizetett rendelesekbol": ha egy asztal
 * felig kartyaval, felig keszpenzzel fizetett, a keszpenzes resz akkor is a
 * fiokban van, ha a rendeles maga meg nincs teljesen rendezve.
 */
function getCashClosingPreview(restaurantId, query = {}) {
  const range = resolveRange(query);
  const payments = paymentsInRange(restaurantId, range).filter((payment) =>
    CASH_METHODS.includes(payment.method)
  );

  const byMethod = summarizeByMethod(payments).filter((row) => CASH_METHODS.includes(row.method));
  const expectedAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);

  return {
    range,
    expectedAmount,
    paymentCount: payments.length,
    byMethod,
    // Mar rogzitettek-e zarast erre az idoszakra (ketszeres zaras elkerulese).
    existingClosings: cashClosingRepository
      .getByRestaurant(restaurantId)
      .filter((closing) => closing.dateFrom === range.dateFrom && closing.dateTo === range.dateTo)
      .map(toClosingView)
  };
}

/** Egy zaras megjelenitesre kesz alakja. */
function toClosingView(closing) {
  const user = closing.closedByUserId ? userRepository.findById(closing.closedByUserId) : null;
  return {
    id: closing.id,
    dateFrom: closing.dateFrom,
    dateTo: closing.dateTo,
    expectedAmount: closing.expectedAmount,
    actualAmount: closing.actualAmount,
    difference: closing.difference,
    closedByUserId: closing.closedByUserId,
    closedByName: user ? user.name : null,
    closedAt: closing.closedAt,
    note: closing.note || ''
  };
}

/**
 * Kasszazaras rogzitese.
 *
 * A vart osszeget mindig a szerver szamolja ujra - a kliens csak a leszamolt
 * osszeget es a jegyzetet kuldi, igy a rogzitett elteres nem hamisithato.
 *
 * @param {string} restaurantId
 * @param {string|null} userId aki zar (a bejelentkezett munkatars)
 * @param {{ dateFrom?, dateTo?, actualAmount, note? }} input
 */
async function createCashClosing(restaurantId, userId, input = {}) {
  const validator = createValidator();
  const range = resolveRange(input, validator);

  const raw = input.actualAmount;
  let actualAmount = 0;
  if (raw === undefined || raw === null || raw === '') {
    validator.fail('actualAmount', 'Add meg a leszámolt összeget.');
  } else {
    actualAmount = toNumber(raw, NaN);
    if (!Number.isFinite(actualAmount) || actualAmount < 0) {
      validator.fail('actualAmount', 'Az összegnek nulla vagy pozitív számnak kell lennie.');
    } else if (actualAmount > MAX_CLOSING_AMOUNT) {
      validator.fail('actualAmount', 'Az összeg irreálisan nagy.');
    }
  }

  validator.optionalString('note', input.note, { max: 500 });
  validator.throwIfInvalid('A zárás adatai hibásak.');

  const preview = getCashClosingPreview(restaurantId, range);

  const closing = await cashClosingRepository.createClosing({
    restaurantId,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    expectedAmount: preview.expectedAmount,
    actualAmount: Math.round(actualAmount),
    closedByUserId: userId || null,
    note: trimmed(input.note)
  });

  return { closing: toClosingView(closing), preview };
}

/**
 * Korabbi zarasok, legujabb elol.
 *
 * @param {string} restaurantId
 * @param {{ limit?: number }} [query]
 */
function listCashClosings(restaurantId, query = {}) {
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(toNumber(query.limit, 50)) || 50)
  );

  const all = cashClosingRepository.getByRestaurant(restaurantId);
  return {
    totalCount: all.length,
    limit,
    closings: all.slice(0, limit).map(toClosingView)
  };
}

module.exports = {
  MAX_RANGE_DAYS: dateRange.MAX_RANGE_DAYS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  CASH_METHODS,
  resolveRange,
  getSummary,
  listOrders,
  getOrderDetail,
  getFilterOptions,
  getCashClosingPreview,
  createCashClosing,
  listCashClosings
};
