import { z }      from 'zod';
import dotenv      from 'dotenv';

dotenv.config();

const envSchema = z.object({
    // ── Database ────────────────────────────────────────────────────────────
    DATABASE_URL: z.string().url(),
    REDIS_URL:    z.string().url(),

    // ── Goldsky ─────────────────────────────────────────────────────────────
    // GOLD_SKY_API_KEY is used by the Goldsky CLI only (not at runtime).
    // Run: goldsky login  →  paste this key
    // The CLI deploys pipelines that push data into your Postgres tables.
    // This service just polls those tables — no WebSocket connection needed.
    GOLD_SKY_API_KEY: z.string().optional(),

    // How often (ms) to poll Goldsky-populated tables for new rows.
    // 2000ms (2s) is a good balance — Goldsky streams sub-second so Postgres
    // will always have fresh data well before each poll.
    POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),

    // ── Compliance (optional) ────────────────────────────────────────────────
    PHAROS_KYC_API_KEY: z.string().optional(),

    // ── Service ─────────────────────────────────────────────────────────────
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
    PORT:      z.coerce.number().int().default(3001),
});

export const env = envSchema.parse(process.env);
