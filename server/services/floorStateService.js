const {
  tableRepository,
  zoneRepository,
  orderRepository,
  orderItemRepository,
  reservationRepository
} = require('../db/repositories');
const { ORDER_STATUS, ORDER_TYPE, TABLE_STATE } = require('../../shared/constants');

/**
 * Az asztalterkep elo allapota a pinceri felulethez.
 *
 * Az allapotot mindig a szerver szamolja a nyitott rendelesekbol es a
 * foglalasokbol - a kliens csak megjeleniti, nem talalgat. Csak a repository
 * interfeszen keresztul er adatot.
 */

/** Meddig elore szamit "kozelgo" foglalasnak egy idopont. */
const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Csak olvasas: az asztalterkep elrendezese a pincernek. */
function listTables(restaurantId) {
  return tableRepository
    .getByRestaurant(restaurantId)
    .sort((a, b) => a.label.localeCompare(b.label, 'hu', { numeric: true }));
}

function listZones(restaurantId) {
  return zoneRepository.getByRestaurant(restaurantId);
}

/**
 * Egy asztal allapota a nyitott rendelesei alapjan.
 *
 *   bill_requested - a vendeg mar szamlat kert (8. szegmens),
 *   ordering       - van nyitott, meg nem fizetett rendeles,
 *   free           - nincs nyitott rendeles.
 */
function statusOf(openOrders) {
  if (openOrders.some((order) => order.status === ORDER_STATUS.BILL_REQUESTED)) {
    return TABLE_STATE.BILL_REQUESTED;
  }
  return openOrders.length ? TABLE_STATE.ORDERING : TABLE_STATE.FREE;
}

/** A kovetkezo, meg le nem jart foglalas egy asztalon. */
function nextReservationOf(tableId, now) {
  return (
    reservationRepository
      .getByTable(tableId)
      .filter((reservation) => new Date(reservation.reservedTo) >= now)
      .sort((a, b) => new Date(a.reservedFrom) - new Date(b.reservedFrom))[0] || null
  );
}

/**
 * Asztalonkenti allapot + a zonakhoz tartozo online rendelesek osszesitese.
 *
 * @param {string} restaurantId
 * @param {Date} [now]
 * @returns {{ states: object[], online: object, generatedAt: string }}
 */
function getTableStates(restaurantId, now = new Date()) {
  const states = listTables(restaurantId).map((table) => {
    const openOrders = orderRepository.getOpenOrdersByTable(table.id);
    const reservation = nextReservationOf(table.id, now);

    const itemCount = openOrders.reduce(
      (total, order) => total + orderItemRepository.getByOrder(order.id).length,
      0
    );

    return {
      tableId: table.id,
      label: table.label,
      status: statusOf(openOrders),
      openOrderCount: openOrders.length,
      openItemCount: itemCount,
      // A legregebbi nyitott rendeles ideje - ebbol latszik, mennyit var az asztal.
      oldestOrderAt: openOrders.length
        ? openOrders
            .map((order) => order.createdAt)
            .sort()[0]
        : null,
      reservation: reservation
        ? {
            id: reservation.id,
            reservedFrom: reservation.reservedFrom,
            reservedTo: reservation.reservedTo,
            comment: reservation.comment || '',
            // Eppen tart-e a foglalas, vagy meg csak kozeleg.
            isActive:
              new Date(reservation.reservedFrom) <= now && now < new Date(reservation.reservedTo),
            isSoon:
              new Date(reservation.reservedFrom) - now > 0 &&
              new Date(reservation.reservedFrom) - now <= UPCOMING_WINDOW_MS
          }
        : null
    };
  });

  return {
    states,
    online: getOnlineSummary(restaurantId),
    generatedAt: now.toISOString()
  };
}

/**
 * Meg fel nem dolgozott online rendelesek - ezek jelennek meg auto ikonkent a
 * zonak teruleten.
 */
function getOnlineSummary(restaurantId) {
  const orders = orderRepository
    .getOnlineOrders(restaurantId)
    .filter((order) => order.status === ORDER_STATUS.NEW || order.status === ORDER_STATUS.ACCEPTED)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return {
    activeCount: orders.length,
    orders: orders.map((order) => ({
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      type: ORDER_TYPE.ONLINE
    }))
  };
}

module.exports = {
  UPCOMING_WINDOW_MS,
  listTables,
  listZones,
  getTableStates,
  getOnlineSummary,
  statusOf
};
