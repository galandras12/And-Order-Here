const bcrypt = require('bcrypt');

/**
 * Jelszo es PIN kod hashelese bcrypt-tel.
 *
 * - passwordHash: admin / logisztika / vezetoseg jelszavaihoz
 * - pinCodeHash:  pincer / szakacs gyors belepesehez (4-6 jegyu kod)
 *
 * A PIN entropiaja alacsony, ezert a tarolt hash mellett a belepest
 * probalkozas-korlatozas is vedi (server/utils/rateLimiter.js).
 */
const PASSWORD_ROUNDS = 10;
const PIN_ROUNDS = 10;

/** 4-6 jegyu szamsor. */
const PIN_PATTERN = /^\d{4,6}$/;

function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('A jelszonak legalabb 6 karakternek kell lennie.');
  }
  return bcrypt.hashSync(password, PASSWORD_ROUNDS);
}

/** Aszinkron valtozat - a keresek kiszolgalasakor ezt hasznaljuk. */
async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string' || !storedHash) {
    return false;
  }
  return bcrypt.compare(password, storedHash);
}

function isValidPinFormat(pinCode) {
  return typeof pinCode === 'string' && PIN_PATTERN.test(pinCode);
}

function hashPin(pinCode) {
  if (!isValidPinFormat(pinCode)) {
    throw new Error('A PIN kod 4-6 szamjegy lehet.');
  }
  return bcrypt.hashSync(pinCode, PIN_ROUNDS);
}

async function verifyPin(pinCode, storedHash) {
  if (!isValidPinFormat(pinCode) || typeof storedHash !== 'string' || !storedHash) {
    return false;
  }
  return bcrypt.compare(pinCode, storedHash);
}

module.exports = {
  hashPassword,
  verifyPassword,
  hashPin,
  verifyPin,
  isValidPinFormat,
  PASSWORD_ROUNDS,
  PIN_ROUNDS
};
