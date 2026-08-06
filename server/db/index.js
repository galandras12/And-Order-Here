const { config } = require('../config');

/**
 * Adatbazis reteg - egyelore csak helyorzo.
 *
 * A tenyleges kapcsolat (driver, pool, migraciok) egy kesobbi fejezetben keszul el;
 * addig is ezen a ponton fut ossze minden adatbazis-hozzaferes.
 */
async function connect() {
  if (!config.databaseUrl) {
    console.warn('[db] Nincs DATABASE_URL, az adatbazis kapcsolat kihagyva.');
    return null;
  }

  console.log('[db] DATABASE_URL beallitva, a kapcsolodas kesobbi fejezetben keszul el.');
  return null;
}

async function disconnect() {
  // Meg nincs nyitott kapcsolat, amit zarni kellene.
}

module.exports = { connect, disconnect };
