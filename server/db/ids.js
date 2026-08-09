const { customAlphabet } = require('nanoid');

// URL-baratsagos, kis-nagybetu erzekeny abece. 16 karakter ~ eleg egyedi ehhez
// a merethez, es olvashatobb marad a JSON fajlban, mint egy teljes UUID.
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generate = customAlphabet(ALPHABET, 16);

/**
 * Uj egyedi azonosito. Opcionalis prefixszel az id-bol latszik az entitas tipusa,
 * ami a JSON fajl kezi bongeszeset is konnyebbe teszi (pl. "ord_9Kd...").
 */
function newId(prefix) {
  const id = generate();
  return prefix ? `${prefix}_${id}` : id;
}

/** Entitasonkenti id prefixek. */
const ID_PREFIX = {
  restaurants: 'res',
  users: 'usr',
  tables: 'tbl',
  zones: 'zon',
  menuCategories: 'mcat',
  menuItems: 'item',
  extras: 'ext',
  reservations: 'rsv',
  orders: 'ord',
  orderItems: 'oit',
  payments: 'pay'
};

module.exports = { newId, ID_PREFIX };
