import { Pool } from 'pg';

export interface ComplianceResult {
    isRwa:          boolean;
    requiredVenues: string[];
    isBlocked:      boolean;
    reason?:        string;
}

/**
 * ComplianceGate — RWA and AML compliance enforcement for route filtering.
 * Fix #15: Replaces the hardcoded "0xRWA_TBILL" check with a DB-backed registry.
 *
 * Check order:
 *   1. Hardcoded baseline list (always-on, zero latency)
 *   2. Postgres kyc_flags table (dynamic, sourced from Indexer/Goldsky)
 *   3. Fail-open: if DB is unavailable, allow the route but log the miss
 */
export class ComplianceGate {
    // Hardcoded RWA token baseline — guaranteed minimum coverage
    private static readonly KNOWN_RWA: Record<string, string[]> = {
        "0xrwa_tbill":  ["chainlink_ccip", "circle_cctp"],
        "0xrwa_mmbill": ["chainlink_ccip"],
        "0xrwa_bond":   ["chainlink_ccip", "circle_cctp"],
    };

    // Hardcoded blocked addresses (OFAC sanctions list baseline)
    private static readonly BLOCKED: Set<string> = new Set([
        "0x7f367cc41522ce07553e823bf3be79a889debe1b", // Tornado Cash deployer
        "0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b",
        "0x901bb9583b24d97e995513c6778dc6888ab6870e",
    ]);

    constructor(private db?: Pool) {}

    /**
     * Checks if a token address belongs to an RWA and returns required bridge venues.
     * Async to support DB fallback without blocking the hot path on cached results.
     */
    public analyzeForRWA(tokenAddress: string): ComplianceResult {
        // Synchronous baseline check (hot path — no DB needed)
        const lower = tokenAddress.toLowerCase();
        const knownVenues = ComplianceGate.KNOWN_RWA[lower];

        if (knownVenues) {
            return { isRwa: true, requiredVenues: knownVenues, isBlocked: false };
        }

        // Not in baseline — return non-RWA (async DB check available separately)
        return { isRwa: false, requiredVenues: [], isBlocked: false };
    }

    /**
     * Full async compliance check: RWA registry + AML screening + DB lookup.
     * Use this in non-hot-path routes (e.g., compliance API endpoint).
     */
    public async analyzeAsync(
        tokenAddress: string,
        userAddress?: string
    ): Promise<ComplianceResult> {
        const lower      = tokenAddress.toLowerCase();
        const userLower  = userAddress?.toLowerCase() ?? '';

        // 1. Blocked address check
        if (ComplianceGate.BLOCKED.has(userLower)) {
            return {
                isRwa: false, requiredVenues: [], isBlocked: true,
                reason: 'Address is on the OFAC sanctions list'
            };
        }

        // 2. Baseline RWA check
        const known = ComplianceGate.KNOWN_RWA[lower];
        if (known) {
            return { isRwa: true, requiredVenues: known, isBlocked: false };
        }

        // 3. Dynamic DB lookup
        if (this.db) {
            try {
                const rwaResult = await this.db.query(
                    `SELECT required_bridges FROM kyc_flags
                     WHERE LOWER(address) = $1 AND is_rwa = TRUE LIMIT 1`,
                    [lower]
                );
                if (rwaResult.rows.length > 0) {
                    return {
                        isRwa: true,
                        requiredVenues: rwaResult.rows[0].required_bridges ?? [],
                        isBlocked: false,
                    };
                }

                // AML risk check on user address
                if (userAddress) {
                    const kycResult = await this.db.query(
                        `SELECT aml_risk, is_kyced FROM kyc_flags
                         WHERE LOWER(address) = $1 LIMIT 1`,
                        [userLower]
                    );
                    if (kycResult.rows.length > 0) {
                        const { aml_risk, is_kyced } = kycResult.rows[0];
                        if (parseFloat(aml_risk) > 0.8) {
                            return {
                                isRwa: false, requiredVenues: [], isBlocked: true,
                                reason: `High AML risk score: ${aml_risk}`
                            };
                        }
                    }
                }
            } catch (e) {
                // DB unavailable — fail open (log and allow)
                console.error('[ComplianceGate] DB lookup failed, failing open:', e);
            }
        }

        return { isRwa: false, requiredVenues: [], isBlocked: false };
    }

    /**
     * Quick synchronous check if an address is known-blocked.
     */
    public isBlocked(address: string): boolean {
        return ComplianceGate.BLOCKED.has(address.toLowerCase());
    }
}
