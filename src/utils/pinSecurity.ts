import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

const BCRYPT_ROUNDS = 10;

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test((pin || '').trim());
}

export function hashPinBcrypt(pin: string): string {
  const clean = (pin || '').trim();
  if (!isValidPinFormat(clean)) {
    throw new Error('PIN must be 4 to 6 digits.');
  }
  const salt = bcrypt.genSaltSync(BCRYPT_ROUNDS);
  return bcrypt.hashSync(clean, salt);
}

export function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]\$\d{2}\$.{53}$/.test(hash || '');
}

export function hashLegacySha256(pin: string): string {
  return createHash('sha256').update((pin || '').trim()).digest('hex');
}

export function verifyPinHash(
  pin: string,
  storedHash: string
): { valid: boolean; needsRehash: boolean } {
  const cleanPin = (pin || '').trim();
  const cleanHash = (storedHash || '').trim();
  if (!cleanPin || !cleanHash) {
    return { valid: false, needsRehash: false };
  }

  if (isBcryptHash(cleanHash)) {
    return {
      valid: bcrypt.compareSync(cleanPin, cleanHash),
      needsRehash: false,
    };
  }

  // Backward compatibility for legacy SHA-256 hashes from earlier DB versions:
  // matches once, then signals caller to upgrade immediately to salted bcrypt.
  if (/^[a-f0-9]{64}$/i.test(cleanHash)) {
    const legacyMatch = hashLegacySha256(cleanPin) === cleanHash.toLowerCase();
    return {
      valid: legacyMatch,
      needsRehash: legacyMatch,
    };
  }

  return { valid: false, needsRehash: false };
}
