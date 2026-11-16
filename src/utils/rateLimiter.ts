export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface LockoutState {
  locked: boolean;
  failedAttempts: number;
  remainingAttempts: number;
  retryAfterSeconds: number;
}

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  consume(key: string, nowMs: number = Date.now()): RateLimitDecision {
    const cutoff = nowMs - this.windowMs;
    const prev = (this.hits.get(key) || []).filter((ts) => ts > cutoff);

    if (prev.length >= this.maxRequests) {
      const oldest = prev[0];
      const retryAfterMs = Math.max(1000, oldest + this.windowMs - nowMs);
      this.hits.set(key, prev);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }

    prev.push(nowMs);
    this.hits.set(key, prev);
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - prev.length),
      retryAfterSeconds: 0,
    };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

export class BruteForceProtector {
  private readonly records = new Map<
    string,
    { failures: number[]; lockedUntilMs: number; lockoutCount: number }
  >();
  private readonly maxFailures: number;
  private readonly failureWindowMs: number;
  private readonly baseLockoutMs: number;

  constructor(
    maxFailures: number = 5,
    failureWindowMs: number = 15 * 60 * 1000,
    baseLockoutMs: number = 5 * 60 * 1000
  ) {
    this.maxFailures = maxFailures;
    this.failureWindowMs = failureWindowMs;
    this.baseLockoutMs = baseLockoutMs;
  }

  check(key: string, nowMs: number = Date.now()): LockoutState {
    const rec = this.records.get(key);
    if (!rec) {
      return {
        locked: false,
        failedAttempts: 0,
        remainingAttempts: this.maxFailures,
        retryAfterSeconds: 0,
      };
    }

    if (rec.lockedUntilMs > nowMs) {
      return {
        locked: true,
        failedAttempts: rec.failures.length,
        remainingAttempts: 0,
        retryAfterSeconds: Math.ceil((rec.lockedUntilMs - nowMs) / 1000),
      };
    }

    const activeFailures = rec.failures.filter((ts) => ts > nowMs - this.failureWindowMs);
    rec.failures = activeFailures;
    if (rec.lockedUntilMs > 0 && rec.lockedUntilMs <= nowMs) {
      rec.lockedUntilMs = 0;
    }

    return {
      locked: false,
      failedAttempts: activeFailures.length,
      remainingAttempts: Math.max(0, this.maxFailures - activeFailures.length),
      retryAfterSeconds: 0,
    };
  }

  recordFailure(key: string, nowMs: number = Date.now()): LockoutState {
    const existing = this.records.get(key) || {
      failures: [],
      lockedUntilMs: 0,
      lockoutCount: 0,
    };

    if (existing.lockedUntilMs > nowMs) {
      return this.check(key, nowMs);
    }

    const activeFailures = existing.failures.filter((ts) => ts > nowMs - this.failureWindowMs);
    activeFailures.push(nowMs);
    existing.failures = activeFailures;

    if (activeFailures.length >= this.maxFailures) {
      const exponent = Math.min(4, existing.lockoutCount);
      const lockDuration = this.baseLockoutMs * Math.pow(2, exponent);
      existing.lockedUntilMs = nowMs + lockDuration;
      existing.lockoutCount += 1;
      existing.failures = [];
      this.records.set(key, existing);
      return {
        locked: true,
        failedAttempts: this.maxFailures,
        remainingAttempts: 0,
        retryAfterSeconds: Math.ceil(lockDuration / 1000),
      };
    }

    this.records.set(key, existing);
    return {
      locked: false,
      failedAttempts: activeFailures.length,
      remainingAttempts: Math.max(0, this.maxFailures - activeFailures.length),
      retryAfterSeconds: 0,
    };
  }

  recordSuccess(key: string): void {
    this.records.delete(key);
  }
}
