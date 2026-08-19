const { COLLECTIONS, MENU_CATEGORY_KIND } = require('../../shared/constants');

/** A JSON fajl sema verzioja - a migraciok ez alapjan futnak le. */
const SCHEMA_VERSION = 8;

/**
 * Ures adatbazis: minden kollekcio egy-egy tomb a JSON fajlon belul.
 * Ez az alapertelmezes jon letre elso indulaskor, ha a data.json meg nem letezik.
 */
function createDefaultData() {
  const data = { schemaVersion: SCHEMA_VERSION };
  for (const name of Object.values(COLLECTIONS)) {
    data[name] = [];
  }
  return data;
}

/** Regi, magyar cimkes allergen ertekek -> uj kulcsok. */
const ALLERGEN_RENAMES = {
  glutén: 'gluten',
  tojás: 'tojas',
  diófélék: 'diofelek',
  szója: 'szoja',
  mustár: 'mustar',
  rákfélék: 'rakfelek',
  földimogyoró: 'foldimogyoro'
};

/**
 * Migraciok verziorol verziora. Mindegyik a nyers adatobjektumot kapja meg,
 * es igazzal ter vissza, ha modositott rajta.
 */
const MIGRATIONS = {
  /**
   * 1 -> 2
   *   - vatRate / serviceFeeRate aranyszamrol (0.27) szazalekra (27),
   *   - menuItems.allergens magyar cimkerol kulcsra (glutén -> gluten).
   */
  2(data) {
    let changed = false;

    for (const restaurant of data.restaurants || []) {
      for (const field of ['vatRate', 'serviceFeeRate']) {
        const value = restaurant[field];
        if (typeof value === 'number' && value > 0 && value <= 1) {
          restaurant[field] = Math.round(value * 1000) / 10;
          changed = true;
        }
      }
    }

    for (const item of data.menuItems || []) {
      if (!Array.isArray(item.allergens)) continue;
      const mapped = item.allergens.map((allergen) => ALLERGEN_RENAMES[allergen] || allergen);
      if (mapped.some((value, index) => value !== item.allergens[index])) {
        item.allergens = mapped;
        changed = true;
      }
    }

    return changed;
  },

  /**
   * 2 -> 3
   *   - orderItems.waiterId es createdAt: a regi tetelek a rendelestol
   *     oroklik, hogy a "ki adta le, mikor" nezet ne maradjon uresen.
   */
  3(data) {
    let changed = false;
    const orderById = new Map((data.orders || []).map((order) => [order.id, order]));

    for (const item of data.orderItems || []) {
      const order = orderById.get(item.orderId);
      if (item.waiterId === undefined) {
        item.waiterId = order ? order.waiterId || null : null;
        changed = true;
      }
      if (item.createdAt === undefined) {
        item.createdAt = order ? order.createdAt : new Date().toISOString();
        changed = true;
      }
    }

    return changed;
  },

  /**
   * 3 -> 4
   *   - menuCategories.kind: a konyhai munkapult ez alapjan szuri az eteleket
   *     (a meglevo kategoriak a nevukbol kapjak meg a tipust),
   *   - orderItems.preparingStartedAt: mikor kezdett keszulni a tetel.
   */
  4(data) {
    let changed = false;

    for (const category of data.menuCategories || []) {
      if (category.kind !== undefined) continue;
      category.kind = kindFromName(category.name);
      changed = true;
    }

    for (const item of data.orderItems || []) {
      if (item.preparingStartedAt !== undefined) continue;
      item.preparingStartedAt = null;
      changed = true;
    }

    return changed;
  },

  /**
   * 4 -> 5
   *   - orders.receiptNumber: a vendegblokkon megjeleno azonosito. A regi
   *     rendelesek is kapnak egyet, hogy a blokkjuk kinyomtathato legyen.
   */
  5(data) {
    let changed = false;
    const used = new Set(
      (data.orders || []).map((order) => order.receiptNumber).filter(Boolean)
    );

    for (const order of data.orders || []) {
      if (order.receiptNumber) continue;

      let candidate;
      do {
        candidate = String(Math.floor(100000 + Math.random() * 900000));
      } while (used.has(candidate));

      used.add(candidate);
      order.receiptNumber = candidate;
      changed = true;
    }

    return changed;
  },

  /**
   * 5 -> 6
   *   - orders.guestName: az online rendelest leado vendeg neve. A korabbi
   *     rendeleseknel nincs ilyen adat, ezert null.
   */
  6(data) {
    let changed = false;

    for (const order of data.orders || []) {
      if (order.guestName !== undefined) continue;
      order.guestName = null;
      changed = true;
    }

    return changed;
  },

  /**
   * 6 -> 7
   *   - orders.paymentStatus: a fizetettsegi allapot (12. szegmens). A korabbi
   *     rendelesek a mar rogzitett fizeteseik osszege alapjan kapjak meg.
   */
  7(data) {
    let changed = false;

    const paidByOrder = new Map();
    for (const payment of data.payments || []) {
      paidByOrder.set(payment.orderId, (paidByOrder.get(payment.orderId) || 0) + payment.amount);
    }

    for (const order of data.orders || []) {
      if (order.paymentStatus !== undefined) continue;
      // A vegosszeg a tetelekbol szamolodik; a migracio csak azt tudja, volt-e
      // egyaltalan fizetes - a pontos allapotot a service ujraszamolja.
      order.paymentStatus = paidByOrder.get(order.id) > 0 ? 'paid' : 'unpaid';
      changed = true;
    }

    return changed;
  },

  /**
   * 7 -> 8
   *   - orderItems.readyAt: mikor lett kesz a tetel (14. szegmens). A
   *     preparingStartedAt-tal egyutt ebbol szamolodik az elkeszitesi ido.
   *
   * A regi teteleknel ez az idopont **nem allithato helyre** - a rendszer eddig
   * nem tarolta -, ezert null marad, meg a mar kiszolgalt teteleknel is. A
   * riport csak azokat a teteleket veszi mintanak, ahol mindket idobelyeg
   * megvan, igy a hianyzo adat nem torzitja az atlagot.
   */
  8(data) {
    let changed = false;

    for (const item of data.orderItems || []) {
      if (item.readyAt !== undefined) continue;
      item.readyAt = null;
      changed = true;
    }

    return changed;
  }
};

/**
 * Kategoria tipusa a nevebol - csak a migraciohoz, hogy a regi adat ne
 * maradjon tipus nelkul. Az ekezetek es a kis/nagybetuk nem szamitanak.
 */
function kindFromName(name) {
  const normalized = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  if (normalized.startsWith('etel')) return MENU_CATEGORY_KIND.FOOD;
  if (normalized.startsWith('ital')) return MENU_CATEGORY_KIND.DRINK;
  return MENU_CATEGORY_KIND.OTHER;
}

/**
 * Meglevo fajl igazitasa az aktualis semahoz:
 *   - hianyzo kollekciok potlasa (pl. ha uj entitas kerult a semaba),
 *   - a szukseges migraciok lefuttatasa a tarolt schemaVersion alapjan.
 *
 * Igy egy regebbi data.json is hasznalhato marad ujraseedeles nelkul.
 *
 * @returns {boolean} true, ha valamit modositani kellett (ilyenkor menteni kell)
 */
function normalizeData(data) {
  let changed = false;

  for (const name of Object.values(COLLECTIONS)) {
    if (!Array.isArray(data[name])) {
      data[name] = [];
      changed = true;
    }
  }

  const currentVersion = Number(data.schemaVersion) || 1;
  for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version += 1) {
    const migrate = MIGRATIONS[version];
    if (!migrate) continue;
    if (migrate(data)) changed = true;
    console.log(`[db] Sema migracio lefutott: ${version - 1} -> ${version}`);
  }

  if (data.schemaVersion !== SCHEMA_VERSION) {
    data.schemaVersion = SCHEMA_VERSION;
    changed = true;
  }

  return changed;
}

module.exports = { SCHEMA_VERSION, createDefaultData, normalizeData };
