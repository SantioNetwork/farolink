import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  EXECUTOR_PRIVATE_KEY: z.string().min(64),
  RPC_URL: z.string().url().default("https://atlantic.dplabs-internal.com"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"]).default("info"),
  PORT: z.string().default("5000"),
  FEE_COLLECTOR_ADDRESS: z.string().default(""),

  // Fix C-1: Shared secret for internal service-to-service auth.
  // The API gateway must send this in x-internal-secret on every request.
  INTERNAL_SECRET: z.string().min(32, "INTERNAL_SECRET must be at least 32 chars"),

  // Router service URL — used for same-chain DEX path resolution
  ROUTER_API_URL: z.string().url().optional().default("http://localhost:3001"),

  // Bridge contract addresses (optional — adapters check these individually)
  LAYERZERO_ENDPOINT_ADDRESS: z.string().optional(),
  CHAINLINK_CCIP_ROUTER:      z.string().optional(),
  CIRCLE_CCTP_MESSENGER:      z.string().optional(),
  AXELAR_GATEWAY_ADDRESS:     z.string().optional(),
  WORMHOLE_BRIDGE_ADDRESS:    z.string().optional(),
  DEBRIDGE_DLN_ADDRESS:       z.string().optional(),
  PHAROS_BRIDGE_ADDRESS:      z.string().optional(),
  PHAROS_FLOW_ROUTER_ADDRESS: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export interface ChainConfig {
  name: string;
  rpcUrl: string;
  bridges: {
    layerzero?: string;
    chainlink_ccip?: string;
    circle_cctp?: string;
    debridge?: string;
    pharos_native?: string;
  };
}

// require() resolves correctly from both ts-node (src/) and compiled node (dist/src/)
// TypeScript's resolveJsonModule handles the typing automatically.
export const chainsConfig: Record<number, ChainConfig> = require('./chains.json');

export function getChainConfig(chainId: number): ChainConfig {
  const config = chainsConfig[chainId];
  if (!config) {
    throw new Error(`Chain ${chainId} is not supported in chains.json configuration.`);
  }
  return config;
}
