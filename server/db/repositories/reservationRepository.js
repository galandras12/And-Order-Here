const { createRepository } = require('./baseRepository');
const { COLLECTIONS } = require('../../../shared/constants');

const base = createRepository(COLLECTIONS.RESERVATIONS);

/** Ket idointervallum atfedese (a hatarok erintese nem szamit atfedesnek). */
function overlaps(aFrom, aTo, bFrom, bTo) {
  return new Date(aFrom) < new Date(bTo) && new Date(bFrom) < new Date(aTo);
}

/** Asztalfoglalasok. Az idopontok ISO 8601 stringkent tarolodnak. */
const reservationRepository = {
  ...base,

  /**
   * @param {{ tableId: string, reservedFrom: string, reservedTo: string, comment?: string }} input
   */
  async createReservation(input) {
    if (reservationRepository.hasConflict(input.tableId, input.reservedFrom, input.reservedTo)) {
      throw new Error('[reservations] Erre az idosavra mar van foglalas ezen az asztalon.');
    }

    return base.insert({
      tableId: input.tableId,
      reservedFrom: new Date(input.reservedFrom).toISOString(),
      reservedTo: new Date(input.reservedTo).toISOString(),
      comment: input.comment || ''
    });
  },

  /** Egy asztal foglalasai, idorendben. */
  getByTable(tableId) {
    return base
      .findBy('tableId', tableId)
      .sort((a, b) => new Date(a.reservedFrom) - new Date(b.reservedFrom));
  },

  /** Foglalasok egy idosavban (opcionalisan egy asztalra szukitve). */
  getInRange(from, to, tableId = null) {
    return base.filter(
      (row) =>
        (!tableId || row.tableId === tableId) &&
        overlaps(row.reservedFrom, row.reservedTo, from, to)
    );
  },

  /** Van-e utkozo foglalas (a sajat rekordot kihagyva modositasnal). */
  hasConflict(tableId, from, to, ignoreId = null) {
    return reservationRepository
      .getInRange(from, to, tableId)
      .some((row) => row.id !== ignoreId);
  },

  /** Eppen aktiv (folyamatban levo) foglalasok egy idopontban. */
  getActiveAt(when = new Date()) {
    const moment = new Date(when);
    return base.filter(
      (row) => new Date(row.reservedFrom) <= moment && moment < new Date(row.reservedTo)
    );
  },

  /** Foglalas athelyezese - utkozes eseten hibat dob. */
  async reschedule(reservationId, reservedFrom, reservedTo) {
    const row = base.findById(reservationId);
    if (!row) return null;
    if (reservationRepository.hasConflict(row.tableId, reservedFrom, reservedTo, reservationId)) {
      throw new Error('[reservations] Erre az idosavra mar van foglalas ezen az asztalon.');
    }
    return base.update(reservationId, {
      reservedFrom: new Date(reservedFrom).toISOString(),
      reservedTo: new Date(reservedTo).toISOString()
    });
  }
};

module.exports = reservationRepository;
