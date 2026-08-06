const { COLLECTIONS } = require('../../shared/constants');

/** A JSON fajl sema verzioja - kesobbi migracioknal ez alapjan lehet donteni. */
const SCHEMA_VERSION = 1;

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

/**
 * Hianyzo kollekciok potlasa mar letezo fajlban (pl. ha uj entitas kerul a semaba).
 * Igy egy regebbi data.json is hasznalhato marad ujraseedeles nelkul.
 *
 * @returns {boolean} true, ha valamit potolni kellett (ilyenkor menteni kell)
 */
function normalizeData(data) {
  let changed = false;

  if (data.schemaVersion !== SCHEMA_VERSION) {
    data.schemaVersion = SCHEMA_VERSION;
    changed = true;
  }

  for (const name of Object.values(COLLECTIONS)) {
    if (!Array.isArray(data[name])) {
      data[name] = [];
      changed = true;
    }
  }

  return changed;
}

module.exports = { SCHEMA_VERSION, createDefaultData, normalizeData };
