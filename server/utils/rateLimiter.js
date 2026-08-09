/**
 * Egyszeru, memoriaban tartott probalkozas-korlatozo.
 *
 * A PIN kod alacsony entropiaju (4-6 szamjegy), ezert a bejelentkezest
 * korlatozni kell. Kulso szolgaltatas (pl. Redis) nelkul, egyetlen Node
 * folyamaton belul tarolunk: kulcs -> sikertelen probalkozasok.
 *
 * Tobb folyamatra skalazasnal ezt kell kozos tarra cserelni, az auth logika
 * tobbi resze valtozatlan maradhat.
 */
class RateLimiter {
  /**
   * @param {{ maxAttempts?: number, windowMs?: number, blockMs?: number }} [options]
   */
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.windowMs = options.windowMs ?? 5 * 60 * 1000;
    this.blockMs = options.blockMs ?? 5 * 60 * 1000;
    this.entries = new Map();
  }

  /** Lejart bejegyzesek takaritasa, hogy a Map ne nojon vegtelenul. */
  prune(now = Date.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.blockedUntil < now && entry.firstAttempt + this.windowMs < now) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * @returns {{ blocked: boolean, retryAfterSeconds: number }}
   */
  check(key) {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || entry.blockedUntil <= now) {
      return { blocked: false, retryAfterSeconds: 0 };
    }
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000)
    };
  }

  /** Sikertelen probalkozas rogzitese. @returns {{ blocked: boolean, remaining: number }} */
  registerFailure(key) {
    const now = Date.now();
    this.prune(now);

    let entry = this.entries.get(key);
    if (!entry || entry.firstAttempt + this.windowMs < now) {
      entry = { count: 0, firstAttempt: now, blockedUntil: 0 };
      this.entries.set(key, entry);
    }

    entry.count += 1;
    if (entry.count >= this.maxAttempts) {
      entry.blockedUntil = now + this.blockMs;
      entry.count = 0;
      entry.firstAttempt = now;
      return { blocked: true, remaining: 0 };
    }

    return { blocked: false, remaining: this.maxAttempts - entry.count };
  }

  /** Sikeres belepes - a szamlalo nullazasa. */
  reset(key) {
    this.entries.delete(key);
  }
}

module.exports = { RateLimiter };
