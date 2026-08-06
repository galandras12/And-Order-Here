/**
 * Kozponti konfiguracio - minden ertek a .env fajlbol jon.
 * Csak ez a modul olvassa a process.env-et, a tobbi kod innen kap ertekeket.
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

/** Igaz/hamis ertek olvasasa kornyezeti valtozobol. */
function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'igen'].includes(String(value).toLowerCase());
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Fajlalapu (JSON) adattarolas - nincs szukseg kulon adatbazis-szerverre.
  dataFile: process.env.DATA_FILE || path.join(__dirname, 'db', 'data.json'),
  // Ures adatbazis eseten indulaskor lefut a seed (teszt etterem adatai).
  seedOnEmpty: bool(process.env.SEED_ON_EMPTY, true),

  // Kesobbi kulso adatbazishoz tartjuk fenn; a JSON tarolas nem hasznalja.
  databaseUrl: process.env.DATABASE_URL || ''
};

/** Fejlesztes kozben csak figyelmeztetunk, hogy a szerver .env nelkul is elinduljon. */
function warnMissing() {
  if (!config.jwtSecret) {
    console.warn('[config] Hianyzo kornyezeti valtozo: JWT_SECRET (lasd .env.example)');
  }
}

module.exports = { config, warnMissing };
