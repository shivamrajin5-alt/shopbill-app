import test from 'node:test';
import assert from 'node:assert/strict';
import { BruteForceProtector, SlidingWindowRateLimiter } from './rateLimiter';

test('SlidingWindowRateLimiter enforces limit and resets after window', () => {
  const limiter = new SlidingWindowRateLimiter(3, 10_000);

  assert.equal(limiter.consume('ip1:login', 1000).allowed, true);
  assert.equal(limiter.consume('ip1:login', 2000).allowed, true);
  const third = limiter.consume('ip1:login', 3000);
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);

  const blocked = limiter.consume('ip1:login', 4000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 7);

  // Different key stays independent
  assert.equal(limiter.consume('ip2:login', 4000).allowed, true);

  // Window expires after 11s
  assert.equal(limiter.consume('ip1:login', 11_500).allowed, true);
});

test('BruteForceProtector locks out after max failures and resets on success', () => {
  const bf = new BruteForceProtector(3, 60_000, 30_000);

  assert.equal(bf.recordFailure('user@shop.in', 1000).locked, false);
  assert.equal(bf.recordFailure('user@shop.in', 2000).locked, false);
  const locked = bf.recordFailure('user@shop.in', 3000);
  assert.equal(locked.locked, true);
  assert.equal(locked.retryAfterSeconds, 30);

  // Remains locked during cooldown
  assert.equal(bf.check('user@shop.in', 10_000).locked, true);

  // Unlocks after cooldown
  assert.equal(bf.check('user@shop.in', 35_000).locked, false);

  // Success clears history
  bf.recordFailure('user@shop.in', 36_000);
  bf.recordSuccess('user@shop.in');
  assert.equal(bf.check('user@shop.in', 36_500).failedAttempts, 0);
});
