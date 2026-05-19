import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  ROUTER_API_URL:   z.string().url().default("http://localhost:3001"),
  EXECUTOR_API_URL: z.string().url().default("http://localhost:3002"),
  DATABASE_URL:     z.string().url().default("postgres://pharos:password@localhost:5432/pharosflow"),
  REDIS_URL:        z.string().url().default("redis://localhost:6379"),
  ADMIN_KEY_HASH:   z.string().length(64, "Must be 64-char SHA-256 hex of the master admin key"),
  LOG_LEVEL:        z.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"]).default("info"),
  PORT:             z.string().default("4000"),
  // Fix C2: Comma-separated list of allowed CORS origins
  ALLOWED_ORIGINS:  z.string().default("http://localhost:5173,http://localhost:4000,https://pharosflow.vercel.app,https://pharosflow.net"),
  // Fix L5: Environment mode for HTTPS redirect and swagger gating
  NODE_ENV:         z.enum(["development", "production", "test"]).default("development"),
  // Fix C-1: Shared secret forwarded to the executor service in x-internal-secret header
  INTERNAL_SECRET:  z.string().min(32, "INTERNAL_SECRET must be at least 32 chars"),
});

export const env = envSchema.parse(process.env);
