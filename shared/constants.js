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
    PAYMENTS: 'payments',
    // Napi kasszazarasok (13. szegmens): a rendszer altal szamolt es a
    // munkatars altal leszamolt keszpenz egyeztetese.
    CASH_CLOSINGS: 'cashClosings'
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
    // A vendeg kerte a szamlat - a fizetes meg nem tortent meg.
    BILL_REQUESTED: 'bill_requested',
    PAID: 'paid',
    CANCELLED: 'cancelled'
  };

  /**
   * Asztal allapota a pinceri asztalterkepen. A szerver szamolja a nyitott
   * rendelesekbol, a kliens csak megjeleniti.
   */
  const TABLE_STATE = {
    FREE: 'free',
    ORDERING: 'ordering',
    BILL_REQUESTED: 'bill_requested'
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

  /** Fizetesi modok cimkevel es rovid leirassal - a feluletek ebbol epitkeznek. */
  const PAYMENT_METHODS = [
    { key: PAYMENT_METHOD.CARD, label: 'Bankkártya', note: 'Bank- vagy hitelkártya' },
    { key: PAYMENT_METHOD.SZEP_CARD, label: 'SZÉP kártya', note: 'Vendéglátás zseb' },
    { key: PAYMENT_METHOD.COUPON, label: 'Kupon', note: 'Utalvány, kupon' },
    { key: PAYMENT_METHOD.CASH, label: 'Készpénz', note: 'Fizetés a helyszínen' },
    { key: PAYMENT_METHOD.ATM_LATER, label: 'Utólagos ATM', note: 'Később, átutalással' }
  ];

  /**
   * A rendeles fizetettsegi allapota. Szandekosan kulon a rendeles
   * eletciklusatol (`status`): egy online rendelest a vendeg mar a leadaskor
   * kifizethet, miközben az etel meg el sem keszult.
   */
  const PAYMENT_STATUS = {
    UNPAID: 'unpaid',
    PAID: 'paid'
  };

  /** Menukategoriak alapertelmezett nevei. */
  const MENU_CATEGORY_NAMES = {
    FOOD: 'Etelek',
    DRINK: 'Italok',
    OTHER: 'Egyeb'
  };

  /**
   * Kategoria tipusa. A konyhai munkapult ez alapjan szuri a teteleket -
   * nem a kategoria nevere, hogy egy atnevezes vagy egy uj etel-kategoria
   * (pl. "Levesek") ne hagyja ki az eteleket a konyhai sorbol.
   */
  const MENU_CATEGORY_KIND = {
    FOOD: 'food',
    DRINK: 'drink',
    OTHER: 'other'
  };

  /** Valaszthato kategoria tipusok a feluleten. */
  const MENU_CATEGORY_KINDS = [
    { key: MENU_CATEGORY_KIND.FOOD, label: 'Étel (a konyhára kerül)' },
    { key: MENU_CATEGORY_KIND.DRINK, label: 'Ital' },
    { key: MENU_CATEGORY_KIND.OTHER, label: 'Egyéb' }
  ];

  /**
   * Az EU altal kotelezoen jelolendo 14 allergen. Az etlap tetelek allergens
   * mezoje ezekbol a kulcsokbol all; a felulet a label-t jeleniti meg.
   */
  const ALLERGENS = [
    { key: 'gluten', label: 'Glutén' },
    { key: 'rakfelek', label: 'Rákfélék' },
    { key: 'tojas', label: 'Tojás' },
    { key: 'hal', label: 'Hal' },
    { key: 'foldimogyoro', label: 'Földimogyoró' },
    { key: 'szoja', label: 'Szója' },
    { key: 'tej', label: 'Tej' },
    { key: 'diofelek', label: 'Diófélék' },
    { key: 'zeller', label: 'Zeller' },
    { key: 'mustar', label: 'Mustár' },
    { key: 'szezam', label: 'Szezámmag' },
    { key: 'kendioxid', label: 'Kén-dioxid / szulfit' },
    { key: 'csillagfurt', label: 'Csillagfürt' },
    { key: 'puhatestuek', label: 'Puhatestűek' }
  ];

  /** Csak a kulcsok - validaciohoz. */
  const ALLERGEN_KEYS = ALLERGENS.map((allergen) => allergen.key);

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
    TABLE_STATE,
    PAYMENT_METHOD,
    PAYMENT_METHODS,
    PAYMENT_STATUS,
    MENU_CATEGORY_NAMES,
    MENU_CATEGORY_KIND,
    MENU_CATEGORY_KINDS,
    ALLERGENS,
    ALLERGEN_KEYS,
    DEFAULT_RECEIPT_FOOTER
  };
});
