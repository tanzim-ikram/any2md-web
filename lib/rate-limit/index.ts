/**
 * Anonymous IP-based rate limiting (plan sections 5-6), built on the same
 * KV store used for file lifecycle records.
 *
 * Privacy constraint from the spec: "do not treat IP addresses as permanent
 * user identities... do not store unnecessary IP history." The rate-limit
 * key is never the raw IP -- it's `sha256(ip + dailySalt)`, and the salt
 * itself rotates once every 24h and is never persisted (derived
 * deterministically from the UTC date), so:
 *
 *   - today's key for a given IP is unrelated to yesterday's key for the
 *     same IP (no cross-day linkability, no accumulating profile)
 *   - the raw IP never appears in the KV store, logs, or anywhere else
 *   - the hash's own TTL equals the rate-limit window, so even the hashed
 *     key doesn't outlive its purpose
 */
import { createHash } from "node:crypto";
import { getKvStore } from "../kv";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets. */
  resetSeconds: number;
}

export interface RateLimitRule {
  /** A short name scoping this limit from others (e.g. "upload", "convert"). */
  name: string;
  limit: number;
  windowSeconds: number;
}

function dailySalt(): string {
  // Rotates at UTC midnight. Never stored -- recomputed from wall-clock time.
  return new Date().toISOString().slice(0, 10);
}

function hashedKey(rule: RateLimitRule, ip: string): string {
  const hash = createHash("sha256").update(`${ip}:${dailySalt()}`).digest("hex").slice(0, 32);
  return `ratelimit:${rule.name}:${hash}`;
}

export async function checkRateLimit(rule: RateLimitRule, ip: string): Promise<RateLimitResult> {
  const kv = await getKvStore();
  const key = hashedKey(rule, ip);
  const count = await kv.incrWithTtl(key, rule.windowSeconds);
  return {
    success: count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetSeconds: rule.windowSeconds,
  };
}

/** Default rules. Deliberately generous for v1 -- tightened once real
 * traffic patterns are known, per the plan's Phase 5. */
export const RATE_LIMITS = {
  upload: { name: "upload", limit: 30, windowSeconds: 60 * 60 }, // 30 uploads/hour
  convert: { name: "convert", limit: 60, windowSeconds: 60 * 60 }, // 60 conversions/hour
} as const satisfies Record<string, RateLimitRule>;

/** Best-effort real client IP from standard proxy headers (Vercel sets
 * x-forwarded-for). Never trust this for anything security-critical beyond
 * rate limiting -- it's attacker-influenceable on non-Vercel deployments. */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
