const {
  tableRepository,
  zoneRepository,
  orderRepository,
  reservationRepository
} = require('../db/repositories');
const { emitTableLayoutChanged } = require('../sockets/emitters');
const {
  NotFoundError,
  ConflictError,
  createValidator,
  trimmed,
  toNumber
} = require('../utils/validation');

/**
 * Asztalterkep: asztalok es zonak kezelese.
 *
 * Csak a repository interfeszen keresztul er adatot. Minden valtozas utan
 * table:layout_changed esemenyt kuld, hogy a pincer felulet eppen nyitva levo
 * asztalterkepe frissulhessen.
 */

/** Meret- es pozicio korlatok - a szerkeszto vaszon merethez igazitva. */
const LIMITS = {
  POSITION_MAX: 5000,
  SIZE_MIN: 30,
  SIZE_MAX: 600,
  ROTATION_MAX: 360
};

/** Uj asztal alapertelmezett merete. */
const DEFAULT_SIZE = { width: 90, height: 90 };

/* ---------------------------------------------------------------- asztalok */

function listTables(restaurantId) {
  return tableRepository
    .getByRestaurant(restaurantId)
    .sort((a, b) => a.label.localeCompare(b.label, 'hu', { numeric: true }));
}

function getTable(restaurantId, tableId) {
  const table = tableRepository.findById(tableId);
  if (!table || table.restaurantId !== restaurantId) {
    throw new NotFoundError('Az asztal nem található.');
  }
  return table;
}

function validateTable(input, { restaurantId, ignoreId = null }) {
  const validator = createValidator();

  validator.requiredString('label', input.label, { max: 40 });
  validator.optionalString('comment', input.comment, { max: 200 });
  validator.numberInRange('posX', input.posX, { min: 0, max: LIMITS.POSITION_MAX, required: false });
  validator.numberInRange('posY', input.posY, { min: 0, max: LIMITS.POSITION_MAX, required: false });
  validator.numberInRange('rotation', input.rotation, { min: 0, max: LIMITS.ROTATION_MAX, required: false });
  validator.numberInRange('width', input.width, { min: LIMITS.SIZE_MIN, max: LIMITS.SIZE_MAX, required: false });
  validator.numberInRange('height', input.height, { min: LIMITS.SIZE_MIN, max: LIMITS.SIZE_MAX, required: false });

  const label = trimmed(input.label);
  const duplicate = tableRepository.find(
    (table) =>
      table.restaurantId === restaurantId &&
      table.id !== ignoreId &&
      table.label.toLowerCase() === label.toLowerCase()
  );
  if (duplicate) validator.fail('label', 'Már van ilyen nevű asztal.');

  validator.throwIfInvalid('Az asztal adatai hibásak.');
  return label;
}

/**
 * Uj asztal. A hianyzo geometria alapertekkel jon letre, hogy a szerkeszto
 * egyetlen gombnyomassal is tudjon asztalt tenni a vaszon kozepere.
 */
async function createTable(restaurantId, input = {}) {
  const label = validateTable(input, { restaurantId });

  const table = await tableRepository.createTable({
    restaurantId,
    label,
    posX: toNumber(input.posX, 0),
    posY: toNumber(input.posY, 0),
    rotation: toNumber(input.rotation, 0),
    width: toNumber(input.width, DEFAULT_SIZE.width),
    height: toNumber(input.height, DEFAULT_SIZE.height),
    comment: trimmed(input.comment)
  });

  emitTableLayoutChanged(restaurantId, { change: 'table_created', table });
  return table;
}

/**
 * Asztal modositasa: pozicio, meret, elforgatas, cimke, komment.
 * A szerkeszto a muvelet lezarasakor (pointerup) hivja.
 */
async function updateTable(restaurantId, tableId, input = {}) {
  const existing = getTable(restaurantId, tableId);
  const label = validateTable({ ...existing, ...input }, { restaurantId, ignoreId: tableId });

  const patch = { label };
  if (input.comment !== undefined) patch.comment = trimmed(input.comment);
  for (const field of ['posX', 'posY', 'rotation', 'width', 'height']) {
    if (input[field] !== undefined && input[field] !== null && input[field] !== '') {
      patch[field] = toNumber(input[field], existing[field]);
    }
  }

  const table = await tableRepository.update(tableId, patch);
  emitTableLayoutChanged(restaurantId, { change: 'table_updated', table });
  return table;
}

/**
 * Mi akadalyozza az asztal torleset: nyitott rendeles vagy jovobeli foglalas.
 * @returns {{ activeOrders: number, upcomingReservations: number }}
 */
function getTableUsage(tableId) {
  const now = new Date();
  return {
    activeOrders: orderRepository.getOpenOrdersByTable(tableId).length,
    upcomingReservations: reservationRepository
      .getByTable(tableId)
      .filter((reservation) => new Date(reservation.reservedTo) >= now).length
  };
}

/**
 * Asztal torlese.
 *
 * Ha van hozza nyitott rendeles vagy jovobeli foglalas, elsore nem toroljuk,
 * hanem 409-cel visszajelzunk a reszletekkel - a felulet ebbol tud
 * megerositest kerni. Megerositessel (force) a torles elvegezheto, es a
 * kapcsolodo foglalasok is torlodnek.
 *
 * @param {{ force?: boolean }} [options]
 */
async function deleteTable(restaurantId, tableId, options = {}) {
  const table = getTable(restaurantId, tableId);
  const usage = getTableUsage(tableId);
  const blocked = usage.activeOrders > 0 || usage.upcomingReservations > 0;

  if (blocked && !options.force) {
    const parts = [];
    if (usage.activeOrders) parts.push(`${usage.activeOrders} nyitott rendelés`);
    if (usage.upcomingReservations) parts.push(`${usage.upcomingReservations} foglalás`);

    throw new ConflictError(
      `A(z) "${table.label}" asztalhoz ${parts.join(' és ')} tartozik. Biztosan törlöd?`,
      'table_in_use',
      { ...usage, requiresConfirmation: true }
    );
  }

  // Megerositett torlesnel a jovobeli foglalasok is mennek - kulonben olyan
  // foglalas maradna, ami mar nem letezo asztalra hivatkozik.
  const removedReservations = await reservationRepository.removeWhere(
    (reservation) => reservation.tableId === tableId
  );

  await tableRepository.remove(tableId);
  emitTableLayoutChanged(restaurantId, { change: 'table_deleted', id: tableId });

  return { id: tableId, deleted: true, removedReservations };
}

/* ------------------------------------------------------------------- zonak */

function listZones(restaurantId) {
  return zoneRepository.getByRestaurant(restaurantId);
}

function getZone(restaurantId, zoneId) {
  const zone = zoneRepository.findById(zoneId);
  if (!zone || zone.restaurantId !== restaurantId) {
    throw new NotFoundError('A zóna nem található.');
  }
  return zone;
}

/** A sokszog pontjainak ellenorzese es normalizalasa. */
function validateShape(validator, shapeCoordinates) {
  if (shapeCoordinates === undefined) return undefined;

  if (!Array.isArray(shapeCoordinates) || shapeCoordinates.length < 3) {
    validator.fail('shapeCoordinates', 'Legalább 3 pont szükséges egy területhez.');
    return [];
  }
  if (shapeCoordinates.length > 100) {
    validator.fail('shapeCoordinates', 'Legfeljebb 100 pont adható meg.');
    return [];
  }

  const points = shapeCoordinates.map((point) => ({
    x: toNumber(point && point.x, NaN),
    y: toNumber(point && point.y, NaN)
  }));

  const invalid = points.some(
    (point) =>
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x > LIMITS.POSITION_MAX ||
      point.y > LIMITS.POSITION_MAX
  );
  if (invalid) validator.fail('shapeCoordinates', 'Érvénytelen koordináta a területen.');

  return points;
}

function validateZone(input, { restaurantId, ignoreId = null, requireShape = true }) {
  const validator = createValidator();
  validator.requiredString('label', input.label, { max: 60 });

  const shape = validateShape(
    validator,
    requireShape ? input.shapeCoordinates || [] : input.shapeCoordinates
  );

  const label = trimmed(input.label);
  const duplicate = zoneRepository.find(
    (zone) =>
      zone.restaurantId === restaurantId &&
      zone.id !== ignoreId &&
      zone.label.toLowerCase() === label.toLowerCase()
  );
  if (duplicate) validator.fail('label', 'Már van ilyen nevű zóna.');

  validator.throwIfInvalid('A zóna adatai hibásak.');
  return { label, shapeCoordinates: shape };
}

async function createZone(restaurantId, input = {}) {
  const data = validateZone(input, { restaurantId });

  const zone = await zoneRepository.createZone({ restaurantId, ...data });
  emitTableLayoutChanged(restaurantId, { change: 'zone_created', zone });
  return zone;
}

async function updateZone(restaurantId, zoneId, input = {}) {
  getZone(restaurantId, zoneId);
  const data = validateZone(input, { restaurantId, ignoreId: zoneId, requireShape: false });

  const patch = { label: data.label };
  if (data.shapeCoordinates !== undefined) patch.shapeCoordinates = data.shapeCoordinates;

  const zone = await zoneRepository.update(zoneId, patch);
  emitTableLayoutChanged(restaurantId, { change: 'zone_updated', zone });
  return zone;
}

/**
 * Zona torlese.
 *
 * A zona csak megjelenitesi terulet, rendeles vagy foglalas nem hivatkozik ra
 * kozvetlenul, ezert nincs blokkolo felhasznalas - a felulet igy is megerositest
 * ker torles elott.
 */
async function deleteZone(restaurantId, zoneId) {
  getZone(restaurantId, zoneId);
  await zoneRepository.remove(zoneId);
  emitTableLayoutChanged(restaurantId, { change: 'zone_deleted', id: zoneId });
  return { id: zoneId, deleted: true };
}

module.exports = {
  LIMITS,
  DEFAULT_SIZE,
  listTables,
  getTable,
  getTableUsage,
  createTable,
  updateTable,
  deleteTable,
  listZones,
  getZone,
  createZone,
  updateZone,
  deleteZone
};
