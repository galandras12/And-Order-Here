const { restaurantRepository } = require('../db/repositories');
const { NotFoundError, createValidator, trimmed, toNumber } = require('../utils/validation');
const { DEFAULT_RECEIPT_FOOTER } = require('../../shared/constants');

/**
 * Etterem torzsadatok kezelese.
 *
 * Csak a repository interfeszen keresztul er adatot - SQL-re valtaskor eleg a
 * repository reteget lecserelni, ez a modul valtozatlan maradhat.
 */

/** A modosithato mezok, az adott sorrendben jelennek meg a feluleten is. */
const EDITABLE_FIELDS = [
  'name',
  'address',
  'phone',
  'vatRate',
  'serviceFeeRate',
  'apCode',
  'receiptFooterMessage'
];

/**
 * Egy etterem lekerese.
 * @param {string} restaurantId
 */
function getRestaurant(restaurantId) {
  const restaurant = restaurantRepository.findById(restaurantId);
  if (!restaurant) {
    throw new NotFoundError('Az étterem nem található.');
  }
  return restaurant;
}

/**
 * Bemenet ellenorzese es normalizalasa.
 *
 * A vatRate es a serviceFeeRate szazalekban ertendo (0-100), ahogy a feluleten
 * is megjelenik - igy nem kell atvaltani a megjelenites es a tarolas kozott.
 */
function validate(input) {
  const validator = createValidator();

  validator.requiredString('name', input.name, { max: 120 });
  validator.optionalString('address', input.address, { max: 200 });
  validator.optionalString('phone', input.phone, { max: 40 });
  validator.optionalString('apCode', input.apCode, { max: 40 });
  validator.optionalString('receiptFooterMessage', input.receiptFooterMessage, { max: 200 });
  validator.numberInRange('vatRate', input.vatRate, { min: 0, max: 100 });
  validator.numberInRange('serviceFeeRate', input.serviceFeeRate, { min: 0, max: 100 });

  validator.throwIfInvalid('Az étterem adatai hibásak.');

  return {
    name: trimmed(input.name),
    address: trimmed(input.address),
    phone: trimmed(input.phone),
    vatRate: toNumber(input.vatRate),
    serviceFeeRate: toNumber(input.serviceFeeRate),
    apCode: trimmed(input.apCode),
    receiptFooterMessage: trimmed(input.receiptFooterMessage) || DEFAULT_RECEIPT_FOOTER
  };
}

/**
 * Etterem alapadatok modositasa.
 *
 * @param {string} restaurantId
 * @param {object} input a modosithato mezok
 * @returns {Promise<object>} a mentett etterem
 */
async function updateRestaurant(restaurantId, input) {
  getRestaurant(restaurantId); // letezik-e egyaltalan
  const patch = validate(input || {});
  return restaurantRepository.update(restaurantId, patch);
}

module.exports = { EDITABLE_FIELDS, getRestaurant, updateRestaurant };
