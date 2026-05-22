/**
 * RedisClient — with in-memory fallback
 *
 * If REDIS_URL is not reachable (e.g. local dev without Redis installed),
 * the module silently falls back to a local in-memory store that satisfies
 * the same interface used by GoldskyConsumer (get/set/setex/publish).
 *
 * Watermarks will reset on restart in fallback mode — acceptable for dev.
 * In production, set a real REDIS_URL (e.g. Upstash) for persistent state.
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || '';

// ── In-memory fallback ───────────────────────────────────────────────────────
class InMemoryRedis {
    private store = new Map<string, { value: string; expiresAt?: number }>();

    async get(key: string): Promise<string | null> {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }

    async set(key: string, value: string): Promise<'OK'> {
        this.store.set(key, { value });
        return 'OK';
    }

    async setex(key: string, ttlSeconds: number, value: string): Promise<'OK'> {
        this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
        return 'OK';
    }

    async publish(channel: string, _message: string): Promise<number> {
        // No-op in fallback mode — router won't get live pub/sub but polling still works
        return 0;
    }

    // Stub ioredis event emitter interface so existing .on() calls don't throw
    on(_event: string, _handler: (...args: any[]) => void): this { return this; }
    off(_event: string, _handler: (...args: any[]) => void): this { return this; }
    once(_event: string, _handler: (...args: any[]) => void): this { return this; }

    // Stub disconnect so shutdown handlers don't crash in fallback mode
    async disconnect(): Promise<void> { this.store.clear(); }
    async quit(): Promise<void> { this.store.clear(); }
}

// ── Factory: real Redis if URL given and reachable, else in-memory ────────────
function createClient(url: string): Redis | InMemoryRedis {
    if (!url) {
        console.warn('[RedisClient] No REDIS_URL set — using in-memory fallback (watermarks reset on restart)');
        return new InMemoryRedis();
    }

    const client = new Redis(url, {
        maxRetriesPerRequest: 1,
        retryStrategy:       (times) => Math.min(times * 50, 2000), // Allow retries
        connectTimeout:      10000,
        family:              4, // Force IPv4
        tls:                 { rejectUnauthorized: false }
    });

    client.on('error', () => {
        // Suppress noisy stack traces — already warned below
    });

    client.on('connect', () => {
        console.log(`[RedisClient] Successfully connected to ${url}`);
    });

    return client;
}

// ── Exports ──────────────────────────────────────────────────────────────────
// Cast as any so GoldskyConsumer doesn't need to know about the union type.
export const redisCache = createClient(redisUrl) as any;
export const redisPub   = createClient(redisUrl) as any;
