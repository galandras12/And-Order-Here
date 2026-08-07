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
    COOK: 'cook',
    ADMIN: 'admin',
    LOGISTICS: 'logistics',
    CUSTOMER: 'customer'
  };

  /** Az adatbazis kollekciok (a JSON fajlon beluli tombok) nevei. */
  const COLLECTIONS = {
    RESTAURANTS: 'restaurants',
    USERS: 'users',
    TABLES: 'tables',
    ZONES: 'zones',
    MENU_CATEGORIES: 'menuCategories',
    MENU_ITEMS: 'menuItems',
    EXTRAS: 'extras',
    RESERVATIONS: 'reservations',
    ORDERS: 'orders',
    ORDER_ITEMS: 'orderItems',
    PAYMENTS: 'payments'
  };

  /** Rendeles tipusa: helyben fogyasztas vagy online rendeles. */
  const ORDER_TYPE = {
    DINE_IN: 'dine_in',
    ONLINE: 'online'
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

  /** Egy rendelesi tetel allapota a konyhai folyamatban. */
  const ORDER_ITEM_STATUS = {
    PENDING: 'pending',
    PREPARING: 'preparing',
    READY: 'ready',
    SERVED: 'served'
  };

  /** Fizetesi modok. */
  const PAYMENT_METHOD = {
    CARD: 'card',
    SZEP_CARD: 'szep_card',
    COUPON: 'coupon',
    CASH: 'cash',
    ATM_LATER: 'atm_later'
  };

  /** Menukategoriak alapertelmezett nevei. */
  const MENU_CATEGORY_NAMES = {
    FOOD: 'Etelek',
    DRINK: 'Italok',
    OTHER: 'Egyeb'
  };

  /** Nyugta lablec alapertelmezett szovege. */
  const DEFAULT_RECEIPT_FOOTER = '– And-Order-Here –';

  // A Socket.io esemeny- es szobanevek kulon fajlban vannak, hogy egy helyen
  // legyen a teljes katalogus: shared/socketEvents.js

  return {
    INTERFACES,
    ROLES,
    COLLECTIONS,
    ORDER_TYPE,
    ORDER_STATUS,
    ORDER_ITEM_STATUS,
    PAYMENT_METHOD,
    MENU_CATEGORY_NAMES,
    DEFAULT_RECEIPT_FOOTER
  };
});
