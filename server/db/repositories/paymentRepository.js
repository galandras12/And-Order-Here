const { createRepository } = require('./baseRepository');
const { COLLECTIONS, PAYMENT_METHOD } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.PAYMENTS);

const VALID_METHODS = Object.values(PAYMENT_METHOD);

/**
 * Fizetesek. Egy rendeleshez tobb fizetes is tartozhat (reszfizetes, megosztott szamla),
 * ezert az osszegeket mindig osszegezve kell nezni.
 */
const paymentRepository = {
  ...base,

  /**
   * @param {{ orderId: string, method: string, amount: number, paidAt?: string }} input
   */
  async addPayment(input) {
    if (!VALID_METHODS.includes(input.method)) {
      throw new Error(`[payments] Ismeretlen fizetesi mod: ${input.method} (${VALID_METHODS.join(', ')})`);
    }
    if (!(input.amount > 0)) {
      throw new Error('[payments] A fizetett osszegnek pozitivnak kell lennie.');
    }

    return base.insert({
      orderId: input.orderId,
      method: input.method,
      amount: input.amount,
      paidAt: input.paidAt || new Date().toISOString()
    });
  },

  /** Egy rendeles fizetesei. */
  getByOrder(orderId) {
    return base.findBy('orderId', orderId);
  },

  /** Egy rendelesre eddig befolyt osszeg. */
  getTotalPaid(orderId) {
    return paymentRepository
      .getByOrder(orderId)
      .reduce((total, payment) => total + payment.amount, 0);
  },

  /** Kifizette-e mar a teljes osszeget. */
  isFullyPaid(orderId, orderTotal) {
    return paymentRepository.getTotalPaid(orderId) >= orderTotal;
  },

  /** Fizetesek fizetesi mod szerint. */
  getByMethod(method) {
    return base.findBy('method', method);
  },

  /** Fizetesek egy idoszakban (napi zaras). */
  getBetween(from, to) {
    const start = new Date(from);
    const end = new Date(to);
    return base.filter((payment) => {
      const paidAt = new Date(payment.paidAt);
      return paidAt >= start && paidAt <= end;
    });
  },

  /** Osszesites fizetesi modonkent egy idoszakra. */
  sumByMethod(from, to) {
    const totals = {};
    for (const method of VALID_METHODS) totals[method] = 0;
    for (const payment of paymentRepository.getBetween(from, to)) {
      totals[payment.method] = (totals[payment.method] || 0) + payment.amount;
    }
    return totals;
  }
};

module.exports = paymentRepository;
