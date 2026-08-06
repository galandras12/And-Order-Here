const crypto = require('crypto');

/**
 * Jelszo hashelés a Node beepitett scrypt fuggvenyevel - kulso csomag nelkul.
 * A teljes autentikacio kesobbi szegmensben keszul el, itt csak annyi kell,
 * hogy a seed felhasznaloknak valodi (nem placeholder) passwordHash mezoje legyen.
 *
 * Tarolt formatum: scrypt$<N>$<salt hex>$<hash hex>
 */
const KEY_LENGTH = 64;
const COST = 16384; // scrypt N parameter

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH, { N: COST });
  return `scrypt$${COST}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Idozites-fuggetlen osszehasonlitas a tarolt hash-sel. */
function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;

  const [scheme, cost, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !cost || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N: Number(cost)
  });

  return crypto.timingSafeEqual(expected, derived);
}

module.exports = { hashPassword, verifyPassword };
