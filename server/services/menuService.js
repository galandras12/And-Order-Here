const {
  menuCategoryRepository,
  menuItemRepository,
  extraRepository
} = require('../db/repositories');
const { emitMenuItemAvailabilityChanged } = require('../sockets/emitters');
const {
  NotFoundError,
  ConflictError,
  createValidator,
  trimmed,
  toNumber
} = require('../utils/validation');
const { ALLERGEN_KEYS } = require('../../shared/constants');

/**
 * Menukezeles: kategoriak, etlap tetelek es extrak.
 *
 * Csak a repository interfeszen keresztul er adatot, es itt vannak az uzleti
 * szabalyok is (pl. nem torolheto olyan kategoria, amiben meg van tetel), hogy
 * a route reteg vekony maradjon.
 */

/* ---------------------------------------------------------------- kategoriak */

/** Egy etterem kategoriai, sorrendben. */
function listCategories(restaurantId) {
  return menuCategoryRepository.getByRestaurant(restaurantId);
}

/** Kategoria lekerese az etteremhez tartozas ellenorzesevel. */
function getCategory(restaurantId, categoryId) {
  const category = menuCategoryRepository.findById(categoryId);
  if (!category || category.restaurantId !== restaurantId) {
    throw new NotFoundError('A menükategória nem található.');
  }
  return category;
}

function validateCategory(input, { restaurantId, ignoreId = null }) {
  const validator = createValidator();
  validator.requiredString('name', input.name, { max: 80 });
  validator.numberInRange('sortOrder', input.sortOrder, {
    min: 0,
    max: 999,
    required: false,
    integer: true
  });

  const name = trimmed(input.name);
  const duplicate = menuCategoryRepository.find(
    (category) =>
      category.restaurantId === restaurantId &&
      category.id !== ignoreId &&
      category.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    validator.fail('name', 'Már van ilyen nevű kategória.');
  }

  validator.throwIfInvalid('A kategória adatai hibásak.');
  return name;
}

/** Uj kategoria. A sortOrder elhagyhato, ilyenkor a lista vegere kerul. */
async function createCategory(restaurantId, input = {}) {
  const name = validateCategory(input, { restaurantId });

  return menuCategoryRepository.createCategory({
    restaurantId,
    name,
    sortOrder:
      input.sortOrder === undefined || input.sortOrder === null || input.sortOrder === ''
        ? undefined
        : toNumber(input.sortOrder)
  });
}

/** Kategoria atnevezese / sorrend allitasa. */
async function updateCategory(restaurantId, categoryId, input = {}) {
  getCategory(restaurantId, categoryId);
  const name = validateCategory(input, { restaurantId, ignoreId: categoryId });

  const patch = { name };
  if (input.sortOrder !== undefined && input.sortOrder !== null && input.sortOrder !== '') {
    patch.sortOrder = toNumber(input.sortOrder);
  }

  return menuCategoryRepository.update(categoryId, patch);
}

/**
 * Kategoria torlese - csak akkor, ha nincs benne etlap tetel.
 * @throws {ConflictError} ha meg tartozik hozza tetel
 */
async function deleteCategory(restaurantId, categoryId) {
  getCategory(restaurantId, categoryId);

  const itemCount = menuItemRepository.getByCategory(categoryId).length;
  if (itemCount > 0) {
    throw new ConflictError(
      `A kategória nem törölhető, mert ${itemCount} menütétel tartozik hozzá.`,
      'category_not_empty'
    );
  }

  await menuCategoryRepository.remove(categoryId);
  return { id: categoryId, deleted: true };
}

/**
 * Kategoriak atrendezese: egy kategoria mozgatasa egy hellyel fel vagy le.
 * A felulet fel/le gombjai ezt hasznaljak.
 *
 * @param {'up'|'down'} direction
 */
async function moveCategory(restaurantId, categoryId, direction) {
  getCategory(restaurantId, categoryId);

  const ordered = listCategories(restaurantId);
  const index = ordered.findIndex((category) => category.id === categoryId);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;

  if (targetIndex < 0 || targetIndex >= ordered.length) {
    // A lista szelen nincs teendo - nem hiba, csak nem valtozik semmi.
    return ordered;
  }

  const reordered = [...ordered];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

  await menuCategoryRepository.reorder(reordered.map((category) => category.id));
  return listCategories(restaurantId);
}

/* -------------------------------------------------------------- etlap tetelek */

/** Az etterem kategoria-id-i - a tetelek ezen keresztul tartoznak etteremhez. */
function categoryIdsOf(restaurantId) {
  return listCategories(restaurantId).map((category) => category.id);
}

/**
 * Etlap tetelek listaja.
 * @param {{ categoryId?: string, availableOnly?: boolean }} [filter]
 */
function listItems(restaurantId, filter = {}) {
  if (filter.categoryId) {
    getCategory(restaurantId, filter.categoryId);
    const items = menuItemRepository.getByCategory(filter.categoryId);
    return filter.availableOnly ? items.filter((item) => item.isAvailable) : items;
  }

  const items = menuItemRepository.getByCategoryIds(categoryIdsOf(restaurantId));
  return filter.availableOnly ? items.filter((item) => item.isAvailable) : items;
}

/** Tetel lekerese az etteremhez tartozas ellenorzesevel. */
function getItem(restaurantId, itemId) {
  const item = menuItemRepository.findById(itemId);
  if (!item) throw new NotFoundError('A menütétel nem található.');

  // A tetel a kategorian keresztul tartozik etteremhez.
  getCategory(restaurantId, item.categoryId);
  return item;
}

function validateItem(input, { restaurantId, ignoreId = null }) {
  const validator = createValidator();

  validator.requiredString('name', input.name, { max: 120 });
  validator.numberInRange('price', input.price, { min: 0, max: 1000000 });
  validator.subsetOf('allergens', input.allergens, ALLERGEN_KEYS);

  if (!input.categoryId) {
    validator.fail('categoryId', 'Válassz kategóriát.');
  } else {
    const category = menuCategoryRepository.findById(input.categoryId);
    if (!category || category.restaurantId !== restaurantId) {
      validator.fail('categoryId', 'Ismeretlen kategória.');
    }
  }

  const name = trimmed(input.name);
  if (input.categoryId) {
    const duplicate = menuItemRepository.find(
      (item) =>
        item.categoryId === input.categoryId &&
        item.id !== ignoreId &&
        item.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) validator.fail('name', 'Ebben a kategóriában már van ilyen nevű tétel.');
  }

  validator.throwIfInvalid('A menütétel adatai hibásak.');

  return {
    categoryId: input.categoryId,
    name,
    price: toNumber(input.price),
    allergens: Array.isArray(input.allergens) ? [...new Set(input.allergens)] : [],
    isAvailable: input.isAvailable === undefined ? true : Boolean(input.isAvailable)
  };
}

/** Uj etlap tetel. */
async function createItem(restaurantId, input = {}) {
  const data = validateItem(input, { restaurantId });
  return menuItemRepository.createItem(data);
}

/**
 * Tetel modositasa. Ha kozben az elerhetoseg is valtozott, valos ideju
 * esemenyt is kikuldunk, hogy a pinceri es online felulet frissulhessen.
 */
async function updateItem(restaurantId, itemId, input = {}) {
  const existing = getItem(restaurantId, itemId);
  const data = validateItem(input, { restaurantId, ignoreId: itemId });

  const updated = await menuItemRepository.update(itemId, data);

  if (existing.isAvailable !== updated.isAvailable) {
    emitMenuItemAvailabilityChanged(restaurantId, updated);
  }

  return updated;
}

/** Tetel torlese. */
async function deleteItem(restaurantId, itemId) {
  getItem(restaurantId, itemId);
  await menuItemRepository.remove(itemId);
  return { id: itemId, deleted: true };
}

/**
 * Gyors elerheto / elfogyott kapcsolo.
 *
 * Mindig kikuldi a menu_item:availability_changed esemenyt a 3. szegmensben
 * elkeszult emitter segedfuggvenyen keresztul.
 *
 * @param {boolean} isAvailable
 */
async function setItemAvailability(restaurantId, itemId, isAvailable) {
  getItem(restaurantId, itemId);

  const validator = createValidator();
  if (typeof isAvailable !== 'boolean') {
    validator.fail('isAvailable', 'Logikai értéket kell megadni (true/false).');
  }
  validator.throwIfInvalid('Hibás elérhetőség érték.');

  const updated = await menuItemRepository.setAvailability(itemId, isAvailable);
  emitMenuItemAvailabilityChanged(restaurantId, updated);
  return updated;
}

/* --------------------------------------------------------------------- extrak */

/** Egy etterem kiegeszitoi. */
function listExtras(restaurantId) {
  return extraRepository
    .getByRestaurant(restaurantId)
    .sort((a, b) => a.name.localeCompare(b.name, 'hu'));
}

function getExtra(restaurantId, extraId) {
  const extra = extraRepository.findById(extraId);
  if (!extra || extra.restaurantId !== restaurantId) {
    throw new NotFoundError('A kiegészítő nem található.');
  }
  return extra;
}

function validateExtra(input, { restaurantId, ignoreId = null }) {
  const validator = createValidator();
  validator.requiredString('name', input.name, { max: 80 });
  validator.numberInRange('price', input.price, { min: 0, max: 1000000 });

  const name = trimmed(input.name);
  const duplicate = extraRepository.find(
    (extra) =>
      extra.restaurantId === restaurantId &&
      extra.id !== ignoreId &&
      extra.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) validator.fail('name', 'Már van ilyen nevű kiegészítő.');

  validator.throwIfInvalid('A kiegészítő adatai hibásak.');
  return { name, price: toNumber(input.price) };
}

async function createExtra(restaurantId, input = {}) {
  const data = validateExtra(input, { restaurantId });
  return extraRepository.createExtra({ restaurantId, ...data });
}

async function updateExtra(restaurantId, extraId, input = {}) {
  getExtra(restaurantId, extraId);
  const data = validateExtra(input, { restaurantId, ignoreId: extraId });
  return extraRepository.update(extraId, data);
}

async function deleteExtra(restaurantId, extraId) {
  getExtra(restaurantId, extraId);
  await extraRepository.remove(extraId);
  return { id: extraId, deleted: true };
}

module.exports = {
  // kategoriak
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  moveCategory,
  // tetelek
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  setItemAvailability,
  // extrak
  listExtras,
  getExtra,
  createExtra,
  updateExtra,
  deleteExtra
};
