/**
 * Egyszeru bemenet-ellenorzes a service reteghez.
 *
 * A service-ek ValidationError-t dobnak, amit a route reteg 400-as JSON
 * valaszra fordit, mezonkenti hibalistaval - igy a felulet meg tudja mutatni,
 * melyik mezo hibas.
 */
class ValidationError extends Error {
  /**
   * @param {string} message
   * @param {Array<{ field: string, message: string }>} [fields]
   */
  constructor(message, fields = []) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.code = 'validation_error';
    this.fields = fields;
  }
}

/** Hivatkozott rekord nem letezik / nem az adott etteremhez tartozik. */
class NotFoundError extends Error {
  constructor(message = 'A keresett elem nem talalhato.') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
    this.code = 'not_found';
  }
}

/** Az elem letezik, de a muvelet uzleti szabaly miatt nem vegezheto el. */
class ConflictError extends Error {
  constructor(message, code = 'conflict') {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
    this.code = code;
  }
}

/**
 * Mezonkenti hibagyujto. A service osszegyujti a hibakat, majd a vegen
 * egyszerre dobja - igy a felulet egy korben megkapja mindet.
 */
function createValidator() {
  const fields = [];

  const validator = {
    /** Hiba rogzitese. */
    fail(field, message) {
      fields.push({ field, message });
      return validator;
    },

    /** Kotelezo, nem ures szoveg. */
    requiredString(field, value, { max = 200 } = {}) {
      if (typeof value !== 'string' || value.trim() === '') {
        return validator.fail(field, 'Kötelező mező.');
      }
      if (value.trim().length > max) {
        return validator.fail(field, `Legfeljebb ${max} karakter lehet.`);
      }
      return validator;
    },

    /** Elhagyhato szoveg, hossz-korlattal. */
    optionalString(field, value, { max = 500 } = {}) {
      if (value === undefined || value === null || value === '') return validator;
      if (typeof value !== 'string') return validator.fail(field, 'Szöveges érték szükséges.');
      if (value.length > max) return validator.fail(field, `Legfeljebb ${max} karakter lehet.`);
      return validator;
    },

    /** Szam adott tartomanyban. */
    numberInRange(field, value, { min, max, required = true, integer = false } = {}) {
      if (value === undefined || value === null || value === '') {
        return required ? validator.fail(field, 'Kötelező mező.') : validator;
      }

      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(num)) return validator.fail(field, 'Számot kell megadni.');
      if (integer && !Number.isInteger(num)) return validator.fail(field, 'Egész számot kell megadni.');
      if (min !== undefined && num < min) return validator.fail(field, `Nem lehet kisebb, mint ${min}.`);
      if (max !== undefined && num > max) return validator.fail(field, `Nem lehet nagyobb, mint ${max}.`);
      return validator;
    },

    /** Csak a megadott ertekek egyike lehet. */
    oneOf(field, value, allowed) {
      if (!allowed.includes(value)) {
        return validator.fail(field, `Érvénytelen érték (${allowed.join(', ')}).`);
      }
      return validator;
    },

    /** Tomb, aminek minden eleme a megengedett halmazbol valo. */
    subsetOf(field, value, allowed) {
      if (value === undefined || value === null) return validator;
      if (!Array.isArray(value)) return validator.fail(field, 'Listát kell megadni.');

      const unknown = value.filter((item) => !allowed.includes(item));
      if (unknown.length) {
        return validator.fail(field, `Ismeretlen érték: ${unknown.join(', ')}.`);
      }
      return validator;
    },

    /** Igaz, ha eddig nem volt hiba. */
    get valid() {
      return fields.length === 0;
    },

    /** Hibak eseten ValidationError dobasa. */
    throwIfInvalid(message = 'Hibás adatok.') {
      if (fields.length) throw new ValidationError(message, fields);
    }
  };

  return validator;
}

/** Szoveg normalizalasa: korulvago szokozok eltavolitasa. */
function trimmed(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

/** Szam normalizalasa (a felulet stringkent kuldi az urlap ertekeit). */
function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

module.exports = {
  ValidationError,
  NotFoundError,
  ConflictError,
  createValidator,
  trimmed,
  toNumber
};
