const db = require('../db');
const { newId, ID_PREFIX } = require('../ids');

/**
 * Kozos CRUD reteg minden kollekciohoz.
 *
 * Az entitas-specifikus repositoryk ezt hasznaljak alapkent, es sajat,
 * beszedes fuggvenyekkel egeszitik ki (pl. getOrdersByTable). A felsobb
 * retegek (route-ok, socket handlerek) igy sosem nyulnak kozvetlenul a JSON-hoz.
 *
 * Olvasas: a memoriabeli cache-bol, mindig masolatot adunk vissza, hogy a hivo
 * ne tudja eszrevetlenul modositani a tarolt adatot.
 * Iras: db.mutate()-en keresztul, ami mutexszel vedve ment fajlba.
 */
function createRepository(collection) {
  const prefix = ID_PREFIX[collection];

  /** A kollekcio nyers (referencia szerinti) tombje - csak belso hasznalatra. */
  function raw() {
    return db.getData()[collection];
  }

  function copy(value) {
    return value === undefined || value === null ? null : structuredClone(value);
  }

  /** Rekord elokeszitese beszurashoz: id-t generalunk, ha a hivo nem adott meg. */
  function buildRow(record) {
    const id = record.id || newId(prefix);
    const row = { id, ...record };
    row.id = id; // a spread felulirhatta volna undefined-dal
    return row;
  }

  const repo = {
    collection,

    /** Osszes rekord. */
    all() {
      return structuredClone(raw());
    },

    /** Rekord id alapjan, vagy null. */
    findById(id) {
      return copy(raw().find((row) => row.id === id));
    },

    /** Elso rekord, amire a feltetel igaz. */
    find(predicate) {
      return copy(raw().find(predicate));
    },

    /** Minden rekord, amire a feltetel igaz. */
    filter(predicate) {
      return structuredClone(raw().filter(predicate));
    },

    /** Rekordok egy mezo pontos erteke alapjan. */
    findBy(field, value) {
      return repo.filter((row) => row[field] === value);
    },

    /**
     * Tobb rekord id szerint, egy menetben.
     *
     * Igy egy szurt halmazhoz tartozo kapcsolodo rekordokat is be lehet tolteni
     * anelkul, hogy a teljes kollekciot be kellene olvasni (pl. a riportoknal:
     * eloszor idoszakra szurunk, aztan csak a talalatok rendeleseit kerjuk le).
     */
    getByIds(ids) {
      const set = ids instanceof Set ? ids : new Set(ids);
      return repo.filter((row) => set.has(row.id));
    },

    /** Elso rekord egy mezo pontos erteke alapjan, vagy null. */
    findOneBy(field, value) {
      return repo.find((row) => row[field] === value);
    },

    /** Rekordok szama (opcionalis feltetellel). */
    count(predicate) {
      return predicate ? raw().filter(predicate).length : raw().length;
    },

    /** Letezik-e ilyen id. */
    exists(id) {
      return raw().some((row) => row.id === id);
    },

    /**
     * Uj rekord. Ha nincs id, generalunk egyet.
     * @returns {Promise<object>} a letrejott rekord masolata
     */
    async insert(record) {
      const row = buildRow(record);

      return db.mutate((data) => {
        if (data[collection].some((existing) => existing.id === row.id)) {
          throw new Error(`[${collection}] Mar letezik rekord ezzel az id-vel: ${row.id}`);
        }
        data[collection].push(structuredClone(row));
        return structuredClone(row);
      });
    },

    /** Tobb rekord beszurasa egy mentessel. */
    async insertMany(records) {
      const rows = records.map(buildRow);

      return db.mutate((data) => {
        for (const row of rows) {
          if (data[collection].some((existing) => existing.id === row.id)) {
            throw new Error(`[${collection}] Mar letezik rekord ezzel az id-vel: ${row.id}`);
          }
          data[collection].push(structuredClone(row));
        }
        return structuredClone(rows);
      });
    },

    /**
     * Rekord reszleges modositasa.
     * @returns {Promise<object|null>} a modositott rekord, vagy null ha nincs ilyen id
     */
    async update(id, patch) {
      return db.mutate((data) => {
        const row = data[collection].find((item) => item.id === id);
        if (!row) return null;
        Object.assign(row, structuredClone(patch), { id: row.id });
        return structuredClone(row);
      });
    },

    /** Rekord torlese. @returns {Promise<boolean>} torolt-e barmit */
    async remove(id) {
      return db.mutate((data) => {
        const index = data[collection].findIndex((item) => item.id === id);
        if (index === -1) return false;
        data[collection].splice(index, 1);
        return true;
      });
    },

    /** Minden rekord torlese, amire a feltetel igaz. @returns {Promise<number>} */
    async removeWhere(predicate) {
      return db.mutate((data) => {
        const keep = data[collection].filter((row) => !predicate(row));
        const removed = data[collection].length - keep.length;
        data[collection] = keep;
        return removed;
      });
    }
  };

  return repo;
}

module.exports = { createRepository };
