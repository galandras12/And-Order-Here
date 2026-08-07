const { COLLECTIONS } = require('../../shared/constants');

/** A JSON fajl sema verzioja - a migraciok ez alapjan futnak le. */
const SCHEMA_VERSION = 2;

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
  }
};

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
