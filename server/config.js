/**
 * Kozponti konfiguracio - minden ertek a .env fajlbol jon.
 * Csak ez a modul olvassa a process.env-et, a tobbi kod innen kap ertekeket.
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  corsOrigin: process.env.CORS_ORIGIN || '*'
};

/** Fejlesztes kozben csak figyelmeztetunk, hogy a szerver .env nelkul is elinduljon. */
function warnMissing() {
  const missing = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.jwtSecret) missing.push('JWT_SECRET');
  if (missing.length) {
    console.warn(`[config] Hianyzo kornyezeti valtozo: ${missing.join(', ')} (lasd .env.example)`);
  }
}

module.exports = { config, warnMissing };
