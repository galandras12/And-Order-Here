const {
  orderRepository,
  orderItemRepository,
  paymentRepository,
  tableRepository
} = require('../db/repositories');
const receiptService = require('./receiptService');
const { emitOrderPaymentRecorded } = require('../sockets/emitters');
const { NotFoundError, ConflictError, createValidator, toNumber } = require('../utils/validation');
const {
  ORDER_STATUS,
  ORDER_ITEM_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS
} = require('../../shared/constants');

/**
 * Fizetesek rogzitese.
 *
 * FONTOS: ebben a szakaszban **nincs valodi fizetesi szolgaltato** (payment
 * gateway) bekotve. A kartyas / SZEP kartyas / kuponos fizetes itt annyit
 * jelent, hogy rogzitjuk a fizetes modjat es osszeget - a tenyleges tranzakcio
 * a helyszinen, kartyaterminalon tortenik. A hely elo van keszitve: egy kesobbi
 * szegmensben a `recordPayment` ele kerulhet a szolgaltato (SimplePay, Barion,
 * Stripe) hivasa, es csak a sikeres tranzakcio utan kell menteni a rekordot.
 *
 * Egy rendeleshez **tobb fizetes is tartozhat** (reszben kartya, reszben
 * keszpenz, kesobb borravalo), ezert az osszegeket mindig osszegezve nezzuk; a
 * rendeles akkor `paid`, ha a befolyt osszeg eleri a vegosszeget.
 *
 * Csak a repository interfeszen keresztul er adatot.
 */

const VALID_METHODS = Object.values(PAYMENT_METHOD);

/** Lezart rendelesre mar nem rogzitunk fizetest. */
const CANCELLED = ORDER_STATUS.CANCELLED;

/** Egy fizetes felso hatara - elgepeles elleni vedelem. */
const MAX_AMOUNT = 10000000;

/**
 * Egy rendeles fizetesi allapota.
 *
 * @param {string} restaurantId
 * @param {string} orderId
 * @returns {object} osszeg, befolyt osszeg, hatralek, allapot es a fizetesek
 */
function getPaymentState(restaurantId, orderId) {
  const { order, storedItems, totals } = receiptService.getOrderTotals(restaurantId, orderId);

  const payments = paymentRepository
    .getByOrder(order.id)
    .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));

  const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const paymentStatus = totals.total > 0 && paidAmount >= totals.total
    ? PAYMENT_STATUS.PAID
    : PAYMENT_STATUS.UNPAID;

  const table = order.tableId ? tableRepository.findById(order.tableId) : null;

  return {
    orderId: order.id,
    receiptNumber: order.receiptNumber || null,
    tableId: order.tableId,
    tableLabel: table ? table.label : null,
    guestName: order.guestName || null,
    type: order.type,
    status: order.status,
    totals,
    total: totals.total,
    paidAmount,
    dueAmount: Math.max(0, totals.total - paidAmount),
    paymentStatus,
    allItemsServed:
      storedItems.length > 0 &&
      storedItems.every((item) => item.status === ORDER_ITEM_STATUS.SERVED),
    payments: payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: payment.amount,
      paidAt: payment.paidAt
    }))
  };
}

/**
 * A rendeles lezarasa, ha mar kifizettek **es** minden tetelt kiszolgaltak.
 *
 * A ket feltetel szandekosan egyutt szerepel: egy online rendelest a vendeg mar
 * a leadaskor kifizet, olyankor viszont a konyhanak meg dolga van vele - a
 * `status` csak akkor valt `paid`-re, amikor tenyleg nincs tobb teendo. Igy
 * szabadul fel az asztal a terkepen, es tunik el a rendeles a nyitottak kozul.
 *
 * @returns {Promise<boolean>} lezarodott-e most a rendeles
 */
async function closeIfSettled(restaurantId, orderId) {
  const state = getPaymentState(restaurantId, orderId);
  const order = orderRepository.findById(orderId);
  if (!order || order.status === ORDER_STATUS.PAID || order.status === CANCELLED) return false;

  if (state.paymentStatus !== PAYMENT_STATUS.PAID || !state.allItemsServed) return false;

  await orderRepository.updateStatus(orderId, ORDER_STATUS.PAID);
  return true;
}

/** A fizetes bemenetenek ellenorzese. */
function validatePayment(input, dueAmount) {
  const validator = createValidator();

  const method = input && input.method;
  validator.oneOf('method', method, VALID_METHODS);

  // Az osszeg elhagyhato: alapertelmezesben a meg hatralevo teljes osszeg.
  // Megadhato kevesebb (reszfizetes) es tobb is (a 16. szegmens borravalo
  // funkciojanak elokeszitesekent) - ezert nincs felso korlat a hatralekhoz
  // kotve, csak egy elgepeles elleni maximum.
  let amount = dueAmount;
  if (input && input.amount !== undefined && input.amount !== null && input.amount !== '') {
    amount = toNumber(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      validator.fail('amount', 'Az összegnek pozitív számnak kell lennie.');
    } else if (amount > MAX_AMOUNT) {
      validator.fail('amount', 'Az összeg irreálisan nagy.');
    }
  }

  validator.throwIfInvalid('A fizetés adatai hibásak.');
  return { method, amount: Math.round(amount) };
}

/**
 * Fizetes rogzitese egy rendelesre.
 *
 * @param {string} restaurantId
 * @param {string} orderId
 * @param {{ method: string, amount?: number }} input
 * @returns {Promise<{ payment: object, state: object, orderClosed: boolean }>}
 */
async function recordPayment(restaurantId, orderId, input = {}) {
  const before = getPaymentState(restaurantId, orderId);

  if (before.status === CANCELLED) {
    throw new ConflictError('A rendelés törölt, nem fizethető.', 'order_cancelled');
  }
  if (before.total <= 0) {
    throw new ConflictError('A rendeléshez nincs fizetendő tétel.', 'order_empty');
  }
  if (before.paymentStatus === PAYMENT_STATUS.PAID) {
    throw new ConflictError(
      'Ez a rendelés már ki van fizetve.',
      'order_already_paid',
      { paidAmount: before.paidAmount, total: before.total }
    );
  }

  const { method, amount } = validatePayment(input, before.dueAmount);

  // TODO (kesobbi szegmens): valodi fizetesi szolgaltato hivasa ide kerul -
  // a rekord csak a sikeres tranzakcio utan mentodne.
  const payment = await paymentRepository.addPayment({ orderId, method, amount });

  const state = getPaymentState(restaurantId, orderId);
  const order = orderRepository.findById(orderId);

  if (order.paymentStatus !== state.paymentStatus) {
    await orderRepository.update(orderId, { paymentStatus: state.paymentStatus });
  }

  const orderClosed = await closeIfSettled(restaurantId, orderId);
  const finalState = orderClosed ? getPaymentState(restaurantId, orderId) : state;

  emitOrderPaymentRecorded(restaurantId, {
    payment: {
      id: payment.id,
      orderId: payment.orderId,
      method: payment.method,
      amount: payment.amount,
      paidAt: payment.paidAt
    },
    order: {
      id: finalState.orderId,
      receiptNumber: finalState.receiptNumber,
      tableId: finalState.tableId,
      tableLabel: finalState.tableLabel,
      type: finalState.type,
      total: finalState.total,
      paidAmount: finalState.paidAmount,
      dueAmount: finalState.dueAmount,
      paymentStatus: finalState.paymentStatus,
      closed: orderClosed
    }
  });

  return { payment, state: finalState, orderClosed };
}

module.exports = {
  MAX_AMOUNT,
  getPaymentState,
  recordPayment,
  closeIfSettled
};
