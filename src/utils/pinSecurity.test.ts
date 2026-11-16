import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashLegacySha256,
  hashPinBcrypt,
  isBcryptHash,
  isValidPinFormat,
  verifyPinHash,
} from './pinSecurity';

test('hashPinBcrypt uses salted bcrypt and never stores plain PIN', () => {
  const hash1 = hashPinBcrypt('1234');
  const hash2 = hashPinBcrypt('1234');

  assert.equal(isBcryptHash(hash1), true);
  assert.equal(isBcryptHash(hash2), true);
  assert.notEqual(hash1, hash2); // unique random salt per hash
  assert.equal(hash1.includes('1234'), false);

  const ok = verifyPinHash('1234', hash1);
  assert.deepEqual(ok, { valid: true, needsRehash: false });

  const bad = verifyPinHash('9999', hash1);
  assert.deepEqual(bad, { valid: false, needsRehash: false });
});

test('verifyPinHash supports legacy SHA-256 upgrade and rejects invalid PIN formats', () => {
  assert.equal(isValidPinFormat('1234'), true);
  assert.equal(isValidPinFormat('123456'), true);
  assert.equal(isValidPinFormat('12'), false);
  assert.equal(isValidPinFormat('abcd'), false);
  assert.throws(() => hashPinBcrypt('abc'));

  const legacy = hashLegacySha256('4321');
  const res = verifyPinHash('4321', legacy);
  assert.deepEqual(res, { valid: true, needsRehash: true });

  const fail = verifyPinHash('0000', legacy);
  assert.deepEqual(fail, { valid: false, needsRehash: false });
});
