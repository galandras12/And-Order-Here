const { tableRepository, reservationRepository } = require('../db/repositories');
const { emitTableReserved } = require('../sockets/emitters');
const {
  NotFoundError,
  ConflictError,
  createValidator,
  trimmed
} = require('../utils/validation');

/**
 * Asztalfoglalasok. A pinceri felulet hasznalja, de az uzleti szabalyok
 * (idorend, utkozes) itt vannak, nem a route-ban.
 */

/** Legfeljebb ennyi ideig tarthat egy foglalas. */
const MAX_DURATION_MS = 12 * 60 * 60 * 1000;

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Az asztal az adott etteremhez tartozik-e. */
function getTable(restaurantId, tableId) {
  const table = tableRepository.findById(tableId);
  if (!table || table.restaurantId !== restaurantId) {
    throw new NotFoundError('Az asztal nem található.');
  }
  return table;
}

/**
 * Uj foglalas.
 *
 * @param {string} restaurantId
 * @param {{ tableId: string, reservedFrom: string, reservedTo: string, comment?: string }} input
 * @returns {Promise<object>} a letrejott foglalas
 */
async function createReservation(restaurantId, input = {}) {
  const validator = createValidator();

  if (!input.tableId) validator.fail('tableId', 'Válassz asztalt.');
  validator.optionalString('comment', input.comment, { max: 200 });

  const from = parseDate(input.reservedFrom);
  const to = parseDate(input.reservedTo);

  if (!from) validator.fail('reservedFrom', 'Adj meg érvényes kezdő időpontot.');
  if (!to) validator.fail('reservedTo', 'Adj meg érvényes záró időpontot.');
  if (from && to && to <= from) {
    validator.fail('reservedTo', 'A vége nem lehet a kezdet előtt.');
  }
  if (from && to && to - from > MAX_DURATION_MS) {
    validator.fail('reservedTo', 'Egy foglalás legfeljebb 12 óra lehet.');
  }
  // A multba foglalas szinte biztosan elgepeles - egy ora turest hagyunk.
  if (from && from.getTime() < Date.now() - 60 * 60 * 1000) {
    validator.fail('reservedFrom', 'Múltbeli időpontra nem lehet foglalni.');
  }

  validator.throwIfInvalid('A foglalás adatai hibásak.');

  const table = getTable(restaurantId, input.tableId);

  if (reservationRepository.hasConflict(table.id, from.toISOString(), to.toISOString())) {
    throw new ConflictError(
      `A(z) "${table.label}" asztal erre az idősávra már foglalt.`,
      'reservation_conflict'
    );
  }

  const reservation = await reservationRepository.createReservation({
    tableId: table.id,
    reservedFrom: from.toISOString(),
    reservedTo: to.toISOString(),
    comment: trimmed(input.comment)
  });

  // Minden nyitva levo pinceri nezet azonnal lassa az uj foglalast.
  emitTableReserved(restaurantId, { ...reservation, tableLabel: table.label });

  return reservation;
}

/** Egy asztal foglalasai (a meg le nem jart idosavok elol). */
function listByTable(restaurantId, tableId) {
  getTable(restaurantId, tableId);
  return reservationRepository.getByTable(tableId);
}

module.exports = { MAX_DURATION_MS, createReservation, listByTable };
