const { createValidator, trimmed } = require('./validation');

/**
 * Idoszak-kezeles a lekerdezesekhez (logisztikai osszesito, vezetoi riportok).
 *
 * Egy helyen van, mert tobb modul is ugyanazt a kerdest teszi fel: "melyik ket
 * idopont koze essen az adat?" - es ugyanugy kell valaszolnia, kulonben ket
 * felulet ugyanarra a napra mast mutatna.
 *
 * A napok hatarai **helyi ido** szerint kepzodnek, nem UTC szerint: a "mai nap"
 * az ettermet uzemelteto ember napja, nem a szerver idozonaja szerinti nulla ora.
 */

/** Elfogadott datum formatum a szurokben. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Egy lekerdezes legfeljebb ekkora idoszakot fedhet le. */
const MAX_RANGE_DAYS = 366;

/** Ket szamjegyre egeszitett szam (datum osszerakasahoz). */
function pad(value) {
  return String(value).padStart(2, '0');
}

/** Egy Date helyi ido szerinti napja YYYY-MM-DD alakban. */
function toDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Nap kezdete helyi ido szerint. */
function dayStart(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/** Nap vege helyi ido szerint. */
function dayEnd(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

/** A mai naphoz kepest eltolt nap (0 = ma, 6 = hat nappal ezelott). */
function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateString(date);
}

/** Ervenyes naptari nap-e (a 2026-02-31 formailag jo, de nem letezik). */
function isRealDate(dateString) {
  if (!DATE_PATTERN.test(dateString)) return false;
  const parsed = dayStart(dateString);
  return !Number.isNaN(parsed.getTime()) && toDateString(parsed) === dateString;
}

/**
 * A lekerdezes idoszaka.
 *
 * Ha csak `dateFrom` erkezik, az **egyetlen napot** jelent (dateTo = dateFrom) -
 * igy egy datum beirasa mindig ugyanazt jelenti, fuggetlenul attol, melyik
 * felulet kerdezi.
 *
 * @param {{ dateFrom?: string, dateTo?: string }} query
 * @param {{ defaultDays?: number, validator?: object }} [options]
 *   defaultDays: hany nap legyen az alapertelmezett idoszak, ha a keres nem ad
 *   datumot (0 = csak a mai nap, 7 = az elmult 7 nap a maival egyutt)
 * @returns {{ dateFrom: string, dateTo: string, from: string, to: string }}
 */
function resolveRange(query = {}, options = {}) {
  const { defaultDays = 0, validator = createValidator() } = options;

  const today = toDateString(new Date());
  const rawFrom = trimmed(query.dateFrom);
  const rawTo = trimmed(query.dateTo);

  const dateFrom = rawFrom || (defaultDays > 1 ? daysAgo(defaultDays - 1) : today);
  const dateTo = rawTo || (rawFrom ? rawFrom : today);

  if (!isRealDate(dateFrom)) validator.fail('dateFrom', 'Érvényes dátum szükséges (ÉÉÉÉ-HH-NN).');
  if (!isRealDate(dateTo)) validator.fail('dateTo', 'Érvényes dátum szükséges (ÉÉÉÉ-HH-NN).');

  if (validator.valid) {
    if (dateFrom > dateTo) {
      validator.fail('dateTo', 'A záró dátum nem lehet korábbi a kezdőnél.');
    } else {
      const days = Math.round((dayStart(dateTo) - dayStart(dateFrom)) / 86400000) + 1;
      if (days > MAX_RANGE_DAYS) {
        validator.fail('dateTo', `Egyszerre legfeljebb ${MAX_RANGE_DAYS} nap kérdezhető le.`);
      }
    }
  }

  validator.throwIfInvalid('A megadott időszak hibás.');

  return {
    dateFrom,
    dateTo,
    from: dayStart(dateFrom).toISOString(),
    to: dayEnd(dateTo).toISOString()
  };
}

/** Beleesik-e egy idobelyeg az idoszakba. */
function inRange(iso, range) {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return time >= new Date(range.from).getTime() && time <= new Date(range.to).getTime();
}

module.exports = {
  MAX_RANGE_DAYS,
  toDateString,
  dayStart,
  dayEnd,
  daysAgo,
  isRealDate,
  resolveRange,
  inRange
};
