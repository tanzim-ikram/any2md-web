/**
 * A tiny key-value store abstraction with TTL, backing both rate limiting
 * (lib/rate-limit) and the file lifecycle record (lib/lifecycle). One
 * interface, two backends, selected by environment:
 *
 *   - Upstash Redis in production (serverless-friendly, REST-based, no
 *     persistent connection) -- used whenever UPSTASH_REDIS_REST_URL is set.
 *   - An in-process Map for local dev, so the app runs with zero external
 *     services out of the box. This does NOT work across multiple serverless
 *     instances or restarts, which is exactly why production needs Redis.
 */

export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomic increment; a TTL is applied only the first time a key is
   * created -- the building block for a fixed-window rate limiter. */
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
}

class MemoryKvStore implements KvStore {
  private store = new Map<string, { value: string; expiresAt: number }>();

  private sweep(key: string) {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.sweep(key);
    return entry ? entry.value : null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.sweep(key);
    const next = (entry ? Number(entry.value) : 0) + 1;
    this.store.set(key, {
      value: String(next),
      expiresAt: entry ? entry.expiresAt : Date.now() + ttlSeconds * 1000,
    });
    return next;
  }
}

class UpstashKvStore implements KvStore {
  constructor(private redis: import("@upstash/redis").Redis) {}

  async get(key: string): Promise<string | null> {
    const value = await this.redis.get<string>(key);
    return value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const next = await this.redis.incr(key);
    if (next === 1) {
      // Only the creator of the key sets its expiry -- avoids resetting the
      // window on every increment.
      await this.redis.expire(key, ttlSeconds);
    }
    return next;
  }
}

let singleton: KvStore | null = null;

export async function getKvStore(): Promise<KvStore> {
  if (singleton) return singleton;
  const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
  if (hasUpstash) {
    const { Redis } = await import("@upstash/redis");
    singleton = new UpstashKvStore(Redis.fromEnv());
  } else {
    singleton = new MemoryKvStore();
  }
  return singleton;
}
