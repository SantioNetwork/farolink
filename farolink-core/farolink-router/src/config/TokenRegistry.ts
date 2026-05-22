/**
 * TokenRegistry — maps token addresses to metadata (symbol, decimals, name).
 * Fix #7: Replaces the hardcoded "TKN" / 18 decimals in PathFinder hop reconstruction.
 *
 * Delegates lookups to the canonical TOKENS array in graph/tokenRegistry.ts which
 * covers 300+ tokens across all supported chains. Runtime-registered tokens take
 * precedence, then the canonical list, then an UNKNOWN fallback.
 */

import { TOKENS } from '../graph/tokenRegistry';
import { PHAROS_TOKENS } from './PharosTokenRegistry';

export interface TokenMeta {
    symbol:   string;
    decimals: number;
    name:     string;
    logoURI?: string;
}

// Runtime override registry — entries here take precedence over the canonical list.
const RUNTIME_REGISTRY: Map<string, TokenMeta> = new Map();

// Auto-register all Pharos Atlantic testnet tokens on module load
for (const t of PHAROS_TOKENS) {
    RUNTIME_REGISTRY.set(t.address.toLowerCase(), {
        symbol:   t.symbol,
        decimals: t.decimals,
        name:     t.name,
    });
}

/**
 * Returns token metadata for a given address (case-insensitive).
 * Priority: runtime overrides → canonical TOKENS list → UNKNOWN fallback.
 */
export function getTokenMeta(address: string): TokenMeta {
    const lower = address.toLowerCase();

    // 1. Check runtime overrides first
    const override = RUNTIME_REGISTRY.get(lower);
    if (override) return override;

    // 2. Delegate to the full canonical TOKENS list (graph/tokenRegistry.ts)
    const canonical = TOKENS.find(t => t.address.toLowerCase() === lower);
    if (canonical) {
        return {
            symbol:   canonical.symbol,
            decimals: canonical.decimals,
            name:     canonical.name,
            logoURI:  canonical.logoURI,
        };
    }

    // 3. Unknown token — return address as name so hops are still readable
    return { symbol: 'UNKNOWN', decimals: 18, name: address };
}

/**
 * Register a new token at runtime (e.g. from a fetched token list).
 * These entries override the canonical list.
 */
export function registerToken(address: string, meta: TokenMeta): void {
    RUNTIME_REGISTRY.set(address.toLowerCase(), meta);
}

