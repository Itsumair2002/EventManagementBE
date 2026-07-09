// Lightweight in-memory TTL cache + fixed-window rate limiter.
// No external dependencies: keeps the AI features cheap and quota-friendly
// without adding infra like Redis. State is per-process, which is fine for a
// single Node instance; swap for Redis if you scale horizontally.

class TTLCache {
  constructor({ ttlMs = 5 * 60 * 1000, maxEntries = 500 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map(); // key -> { value, expiresAt }
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh LRU ordering.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.store.size >= this.maxEntries) {
      // Evict oldest (first inserted) entry.
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  clear() {
    this.store.clear();
  }
}

class RateLimiter {
  constructor({ windowMs = 60 * 1000, max = 12 } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map(); // key -> { count, resetAt }
  }

  // Returns { allowed, remaining, retryAfterMs }.
  check(key) {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || now > entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.max - 1, retryAfterMs: 0 };
    }

    if (entry.count >= this.max) {
      return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
    }

    entry.count += 1;
    return { allowed: true, remaining: this.max - entry.count, retryAfterMs: 0 };
  }
}

module.exports = { TTLCache, RateLimiter };
