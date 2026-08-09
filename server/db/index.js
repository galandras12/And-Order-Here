const { config } = require('../config');
const db = require('./db');
const repositories = require('./repositories');
const { seedIfEmpty } = require('./seed');

/**
 * Adatbazis reteg belepesi pont.
 *
 * Fajlalapu (JSON) tarolas lowdb-vel: nincs szukseg kulon adatbazis-szerverre,
 * az `npm install` + `npm start` eleg. A JSON fajl elso indulaskor automatikusan
 * letrejon, es ha ures, a teszt adatok is betoltodnek (SEED_ON_EMPTY).
 *
 * Hasznalat a felsobb retegekben:
 *   const { orderRepository } = require('../db');
 */
async function connect() {
  await db.init();

  if (config.seedOnEmpty) {
    const result = await seedIfEmpty();
    if (!result.skipped) {
      console.log('[db] Ures adatbazis - teszt adatok betoltve (SEED_ON_EMPTY=false kikapcsolja).');
    }
  }

  console.log('[db] Kollekciok:', db.stats());
  return db;
}

async function disconnect() {
  await db.close();
}

module.exports = {
  connect,
  disconnect,
  db,
  ...repositories
};
