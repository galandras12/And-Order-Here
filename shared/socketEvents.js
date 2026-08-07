/**
 * Kozponti Socket.io esemeny- es szobakatalogus.
 *
 * Szerver es kliens is ezt hasznalja, hogy ne lehessen elgepelni az
 * esemenyneveket:
 *   - szerveren:   const { SOCKET_EVENTS } = require('../../shared/socketEvents');
 *   - bongeszoben: <script src="/shared/socketEvents.js"></script> -> window.SOCKET_CATALOG
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SOCKET_CATALOG = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** Socket.io beepitett eletciklus esemenyei. */
  const LIFECYCLE_EVENTS = {
    CONNECTION: 'connection',
    DISCONNECT: 'disconnect'
  };

  /**
   * Uzleti esemenyek. Az uzleti logika a kovetkezo szegmensekben epul ra,
   * egyelore a teszt vegponton keresztul valthatok ki.
   */
  const SOCKET_EVENTS = {
    ORDER_CREATED: 'order:created',
    ORDER_ITEM_STATUS_CHANGED: 'order_item:status_changed',
    ORDER_ITEM_SERVED: 'order_item:served',
    TABLE_STATUS_CHANGED: 'table:status_changed',
    TABLE_RESERVED: 'table:reserved',
    MENU_ITEM_AVAILABILITY_CHANGED: 'menu_item:availability_changed'
  };

  /** A szerver ezt kuldi kapcsolodas utan: melyik szobakba kerult a kliens. */
  const SESSION_EVENT = 'session:ready';

  /** Szoba utotagok feluletenkent. */
  const ROOM_KEYS = {
    WAITERS: 'waiters',
    KITCHEN: 'kitchen',
    ADMIN: 'admin',
    LOGISTICS: 'logistics',
    ONLINE: 'online'
  };

  /** Szerepkor -> szoba. Az online felulet bejelentkezes nelkuli, kulon kezeljuk. */
  const ROLE_ROOM = {
    waiter: ROOM_KEYS.WAITERS,
    cook: ROOM_KEYS.KITCHEN,
    admin: ROOM_KEYS.ADMIN,
    logistics: ROOM_KEYS.LOGISTICS,
    customer: ROOM_KEYS.ONLINE
  };

  /**
   * Szoba neve: restaurant:{restaurantId}:{key}
   * @param {string} restaurantId
   * @param {string} key a ROOM_KEYS egyik erteke
   */
  function roomName(restaurantId, key) {
    return `restaurant:${restaurantId}:${key}`;
  }

  /** Egy etterem osszes szobaja - broadcast minden felulethez. */
  function allRooms(restaurantId) {
    return Object.values(ROOM_KEYS).map((key) => roomName(restaurantId, key));
  }

  /** Belso (bejelentkezest igenylo) feluletek szobai - az online kimarad. */
  function staffRooms(restaurantId) {
    return [ROOM_KEYS.WAITERS, ROOM_KEYS.KITCHEN, ROOM_KEYS.ADMIN, ROOM_KEYS.LOGISTICS].map(
      (key) => roomName(restaurantId, key)
    );
  }

  /** Az esemenykatalogus osszes uzleti esemenye listaban. */
  const ALL_EVENTS = Object.values(SOCKET_EVENTS);

  return {
    LIFECYCLE_EVENTS,
    SOCKET_EVENTS,
    SESSION_EVENT,
    ROOM_KEYS,
    ROLE_ROOM,
    ALL_EVENTS,
    roomName,
    allRooms,
    staffRooms
  };
});
