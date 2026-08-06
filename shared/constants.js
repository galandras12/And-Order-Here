/**
 * Kozos konstansok a szerver es a bongeszo oldali kod szamara.
 *
 * A fajl szandekosan fuggosegmentes es ketfelekeppen hasznalhato:
 *   - szerveren:  const { INTERFACES } = require('../shared/constants');
 *   - bongeszoben: <script src="/shared/constants.js"></script>  ->  window.APP_CONSTANTS
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.APP_CONSTANTS = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** Az 5 kiszolgalt felulet. A route es a /public alkonyvtar neve egyezik a kulccsal. */
  const INTERFACES = [
    { key: 'waiter', path: '/waiter', title: 'Pincer felulet' },
    { key: 'admin', path: '/admin', title: 'Admin / vezetoi felulet' },
    { key: 'logistics', path: '/logistics', title: 'Logisztikai felulet' },
    { key: 'kitchen', path: '/kitchen', title: 'Konyhai felulet' },
    { key: 'online', path: '/online', title: 'Online rendeles' }
  ];

  /** Felhasznaloi szerepkorok (a kesobbi JWT autentikaciohoz). */
  const ROLES = {
    WAITER: 'waiter',
    ADMIN: 'admin',
    LOGISTICS: 'logistics',
    KITCHEN: 'kitchen',
    CUSTOMER: 'customer'
  };

  /** Rendelesi allapotok eletciklusa. */
  const ORDER_STATUS = {
    NEW: 'new',
    ACCEPTED: 'accepted',
    IN_PREPARATION: 'in_preparation',
    READY: 'ready',
    SERVED: 'served',
    PAID: 'paid',
    CANCELLED: 'cancelled'
  };

  /** Socket.io szobak - feluletenkent egy broadcast csatorna. */
  const SOCKET_ROOMS = {
    WAITER: 'room:waiter',
    ADMIN: 'room:admin',
    LOGISTICS: 'room:logistics',
    KITCHEN: 'room:kitchen',
    ONLINE: 'room:online'
  };

  /** Socket.io esemenynevek. A kezelok kesobbi fejezetben keszulnek el. */
  const SOCKET_EVENTS = {
    CONNECTION: 'connection',
    DISCONNECT: 'disconnect',
    JOIN_ROOM: 'room:join',
    ORDER_CREATED: 'order:created',
    ORDER_UPDATED: 'order:updated',
    ORDER_READY: 'order:ready',
    STOCK_UPDATED: 'stock:updated'
  };

  return { INTERFACES, ROLES, ORDER_STATUS, SOCKET_ROOMS, SOCKET_EVENTS };
});
