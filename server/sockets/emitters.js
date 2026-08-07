const { ORDER_TYPE } = require('../../shared/constants');
const {
  SOCKET_EVENTS,
  ROOM_KEYS,
  roomName,
  allRooms,
  staffRooms
} = require('../../shared/socketEvents');

/**
 * Szerver oldali kibocsato reteg.
 *
 * A route- es service reteg ezeket a fuggvenyeket hivja, nem kozvetlenul a
 * Socket.io API-t - igy egy helyen van, hogy melyik esemeny melyik szobaba
 * megy, es a retegek szet vannak valasztva.
 *
 *   const { emitOrderCreated } = require('../sockets/emitters');
 *   emitOrderCreated(order);
 */

let io = null;

/** A Socket.io peldany atadasa (a sockets/index.js hivja inditaskor). */
function bindIo(instance) {
  io = instance;
}

function getIo() {
  return io;
}

/**
 * Kozos kikuldes: egy esemeny tobb szobaba, egyseges burokban.
 *
 * @param {string[]} rooms cel szobak
 * @param {string} event esemenynev a katalogusbol
 * @param {object} payload
 * @returns {boolean} sikerult-e kikuldeni (false, ha meg nincs Socket.io peldany)
 */
function emitToRooms(rooms, event, payload) {
  if (!io) {
    console.warn(`[socket] Nincs inicializalt Socket.io peldany, kihagyva: ${event}`);
    return false;
  }
  if (!rooms.length) return false;

  io.to(rooms).emit(event, { event, emittedAt: new Date().toISOString(), ...payload });
  return true;
}

/**
 * Uj rendeles. A pinceri, konyhai es admin felulet kapja meg; online rendelesnel
 * a rendelo (online szoba) is, hogy visszaigazolast lasson.
 *
 * @param {object} order a rendeles rekord (restaurantId szukseges)
 * @param {object[]} [items] a rendeles tetelei, ha mar ismertek
 */
function emitOrderCreated(order, items = []) {
  const rooms = [
    roomName(order.restaurantId, ROOM_KEYS.WAITERS),
    roomName(order.restaurantId, ROOM_KEYS.KITCHEN),
    roomName(order.restaurantId, ROOM_KEYS.ADMIN)
  ];
  if (order.type === ORDER_TYPE.ONLINE) {
    rooms.push(roomName(order.restaurantId, ROOM_KEYS.ONLINE));
  }

  return emitToRooms(rooms, SOCKET_EVENTS.ORDER_CREATED, { order, items });
}

/**
 * Uj tetelek egy mar nyitott rendelesen (a pincer utolag rendelt hozza).
 *
 * A pinceri es a konyhai felulet kapja meg - a konyha ebbol tudja, hogy uj
 * teteleket kell keszitenie. Az admin is megkapja, mert az order:created-et is
 * megkapja: kulonben a rendelesrol alkotott kepe elavulna.
 *
 * @param {object} order a rendeles, amihez a tetelek kerultek
 * @param {object[]} items az uj tetelek
 */
function emitOrderItemsAdded(order, items) {
  const rooms = [
    roomName(order.restaurantId, ROOM_KEYS.WAITERS),
    roomName(order.restaurantId, ROOM_KEYS.KITCHEN),
    roomName(order.restaurantId, ROOM_KEYS.ADMIN)
  ];
  if (order.type === ORDER_TYPE.ONLINE) {
    rooms.push(roomName(order.restaurantId, ROOM_KEYS.ONLINE));
  }

  return emitToRooms(rooms, SOCKET_EVENTS.ORDER_ITEM_ADDED, { order, items });
}

/**
 * Rendelesi tetel allapotvaltasa (pending -> preparing -> ready -> served).
 *
 * @param {string} restaurantId a tetel a rendelesen keresztul tartozik etteremhez
 * @param {object} orderItem
 */
function emitOrderItemStatusChanged(restaurantId, orderItem) {
  return emitToRooms(staffRooms(restaurantId), SOCKET_EVENTS.ORDER_ITEM_STATUS_CHANGED, {
    orderItem
  });
}

/** Tetel kiszolgalva - a pincer es a konyha lathatja, az admin kovetheti. */
function emitOrderItemServed(restaurantId, orderItem) {
  return emitToRooms(staffRooms(restaurantId), SOCKET_EVENTS.ORDER_ITEM_SERVED, { orderItem });
}

/** Asztal allapotvaltasa (szabad / foglalt / fizetesre var). */
function emitTableStatusChanged(restaurantId, table) {
  const rooms = [
    roomName(restaurantId, ROOM_KEYS.WAITERS),
    roomName(restaurantId, ROOM_KEYS.ADMIN)
  ];
  return emitToRooms(rooms, SOCKET_EVENTS.TABLE_STATUS_CHANGED, { table });
}

/**
 * Az asztalterkep elrendezese valtozott: az admin hozzaadott, athelyezett,
 * atmeretezett, elforgatott vagy torolt egy asztalt/zonat.
 *
 * A pincer felulet eppen nyitva levo asztalterkepe ebbol tud frissulni.
 *
 * @param {string} restaurantId
 * @param {{ change: string, table?: object, zone?: object, id?: string }} payload
 */
function emitTableLayoutChanged(restaurantId, payload) {
  const rooms = [
    roomName(restaurantId, ROOM_KEYS.WAITERS),
    roomName(restaurantId, ROOM_KEYS.ADMIN)
  ];
  return emitToRooms(rooms, SOCKET_EVENTS.TABLE_LAYOUT_CHANGED, payload);
}

/** Uj asztalfoglalas. */
function emitTableReserved(restaurantId, reservation) {
  const rooms = [
    roomName(restaurantId, ROOM_KEYS.WAITERS),
    roomName(restaurantId, ROOM_KEYS.ADMIN)
  ];
  return emitToRooms(rooms, SOCKET_EVENTS.TABLE_RESERVED, { reservation });
}

/**
 * Etlap tetel elerhetosege valtozott (elfogyott / ujra van).
 * Ez mindenkit erint, az online etlapot is.
 */
function emitMenuItemAvailabilityChanged(restaurantId, menuItem) {
  return emitToRooms(
    allRooms(restaurantId),
    SOCKET_EVENTS.MENU_ITEM_AVAILABILITY_CHANGED,
    { menuItem }
  );
}

module.exports = {
  bindIo,
  getIo,
  emitToRooms,
  emitOrderCreated,
  emitOrderItemsAdded,
  emitOrderItemStatusChanged,
  emitOrderItemServed,
  emitTableStatusChanged,
  emitTableLayoutChanged,
  emitTableReserved,
  emitMenuItemAvailabilityChanged
};
