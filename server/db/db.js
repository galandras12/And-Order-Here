const fs = require('fs');
const path = require('path');
const { Mutex } = require('async-mutex');

const { config } = require('../config');
const { createDefaultData, normalizeData } = require('./defaultData');

/**
 * Fajlalapu (JSON) adattarolas lowdb-vel, kulon adatbazis-szerver nelkul.
 *
 * Mukodes:
 *   - a teljes adathalmaz egyetlen JSON fajlban el (alapertelmezes: server/db/data.json),
 *   - indulaskor egyszer beolvassuk memoriaba (`state`), a kesobbi olvasasok mar innen mennek,
 *   - minden modositas a memoriaban tortenik, majd azonnal fajlba is mentodik,
 *   - az irasok egy mutexen mennek keresztul, igy parhuzamos keresek sem tudjak
 *     osszeakasztani vagy csonkolni a fajlt.
 *
 * A lowdb 7 csak ESM modulkent erheto el, ezert dinamikus `import()`-tal toltjuk be
 * a CommonJS kodbol - igy a projekt tobbi resze valtozatlanul `require`-t hasznalhat.
 */

const writeMutex = new Mutex();

let low = null; // a lowdb peldany
let state = null; // in-memory cache: a teljes adatobjektum
let filePath = null;
let initPromise = null;

/** Mely masolat, hogy a hivo ne tudja veletlenul modositani a cache-t. */
function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function ensureReady() {
  if (!state) {
    throw new Error('[db] Az adatbazis nincs inicializalva. Hivd meg elobb: await db.init()');
  }
}

async function createLowInstance(file) {
  const { Low } = await import('lowdb');
  const { JSONFile } = await import('lowdb/node');

  fs.mkdirSync(path.dirname(file), { recursive: true });
  return new Low(new JSONFile(file), createDefaultData());
}

/**
 * Adatbazis inicializalasa. Tobbszor is hivhato, csak egyszer fut le.
 * Ha a JSON fajl meg nem letezik, letrejon az ures alapstrukturaval.
 *
 * @param {{ file?: string }} [options]
 */
function init(options = {}) {
  if (initPromise) return initPromise;

  filePath = path.resolve(options.file || config.dataFile);

  initPromise = (async () => {
    low = await createLowInstance(filePath);

    const existed = fs.existsSync(filePath);
    await low.read();

    if (!low.data) low.data = createDefaultData();
    const patched = normalizeData(low.data);

    // Elso indulaskor (vagy hianyzo kollekcioknal) kiirjuk a fajlt.
    if (!existed || patched) {
      await low.write();
    }

    state = low.data;
    console.log(`[db] JSON adatbazis: ${filePath}${existed ? '' : ' (ujonnan letrehozva)'}`);
    return state;
  })().catch((err) => {
    initPromise = null;
    throw err;
  });

  return initPromise;
}

/** Igaz, ha az adatbazis mar hasznalhato. */
function isReady() {
  return state !== null;
}

/** A teljes in-memory allapot - a repository reteg hasznalja, masolas nelkul. */
function getData() {
  ensureReady();
  return state;
}

/**
 * Egy kollekcio (vagy barmely felso szintu kulcs) erteke masolatkent.
 * @param {string} key pl. 'orders'
 */
function get(key) {
  ensureReady();
  return clone(state[key]);
}

/**
 * Egy kollekcio teljes felulirasa es mentese.
 * @param {string} key
 * @param {*} value
 */
async function set(key, value) {
  ensureReady();
  return mutate((data) => {
    data[key] = clone(value);
    return data[key];
  });
}

/**
 * Modositas es mentes egy lepesben, kizarolagos hozzaferessel.
 * A callback a nyers in-memory adatot kapja meg; a visszateresi erteket
 * a hivo kapja vissza, a mentes automatikusan megtortenik.
 *
 * @template T
 * @param {(data: object) => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
async function mutate(fn) {
  ensureReady();
  return writeMutex.runExclusive(async () => {
    const result = await fn(state);
    await low.write();
    return result;
  });
}

/** Kenyszeritett mentes fajlba (modositas nelkul is). */
async function save() {
  ensureReady();
  return writeMutex.runExclusive(() => low.write());
}

/** Ujraolvasas a fajlbol - a memoriabeli cache eldobasaval. */
async function reload() {
  ensureReady();
  return writeMutex.runExclusive(async () => {
    await low.read();
    if (!low.data) low.data = createDefaultData();
    normalizeData(low.data);
    state = low.data;
    return state;
  });
}

/**
 * Teljes adathalmaz csereje (a seed script hasznalja).
 * @param {object} data
 */
async function replaceAll(data) {
  ensureReady();
  return writeMutex.runExclusive(async () => {
    const next = clone(data);
    normalizeData(next);
    low.data = next;
    state = next;
    await low.write();
    return state;
  });
}

/** Minden kollekcio uritese. */
async function clear() {
  return replaceAll(createDefaultData());
}

/** A hasznalt JSON fajl abszolut utvonala. */
function getFilePath() {
  return filePath;
}

/** Rekordszam kollekcionkent - naplozashoz, ellenorzeshez. */
function stats() {
  ensureReady();
  const out = {};
  for (const [key, value] of Object.entries(state)) {
    if (Array.isArray(value)) out[key] = value.length;
  }
  return out;
}

/** Lezaras: a memoriabeli allapot eldobasa (a fajl mar mentve van). */
async function close() {
  if (!state) return;
  await writeMutex.runExclusive(() => low.write());
  state = null;
  low = null;
  initPromise = null;
}

module.exports = {
  init,
  isReady,
  getData,
  get,
  set,
  mutate,
  save,
  reload,
  replaceAll,
  clear,
  getFilePath,
  stats,
  close
};
