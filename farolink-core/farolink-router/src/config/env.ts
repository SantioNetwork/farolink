import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  REDIS_URL:   z.string().url().default("redis://localhost:6379"),
  LOG_LEVEL:   z.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"]).default("info"),
  PORT:        z.string().default("3001"),
  PRIVATE_RPC_URL: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);
