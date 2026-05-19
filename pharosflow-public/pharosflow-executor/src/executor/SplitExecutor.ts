import { BridgeAbstractor } from "./BridgeAbstractor";
import { Hop } from "../bridges/BridgeAdapter";
import winston from "winston";

export interface SplitResult {
    hopIndex: number;
    txHash:   string;
    status:   string;
    venue:    string;
    error?:   string;
    fraction: bigint;   // The fraction (out of 100) this leg was responsible for
    amount:   bigint;   // The wei amount for this leg
}

export interface VenueSplit {
    venueName: string;
    fraction:  bigint;  // percentage out of 100n, must sum to 100n
}

/**
 * Thrown when one or more split legs fail after other legs have already been submitted.
 * Contains full results so the caller can report exact stuck amounts to the user.
 */
export class SplitPartialFailureError extends Error {
    constructor(
        public readonly results: SplitResult[],
        public readonly failedLegs: SplitResult[],
        public readonly succeededLegs: SplitResult[],
    ) {
        const summary = failedLegs
            .map(l => `${l.venue} (${l.fraction}%, ~${l.amount.toString()} wei): ${l.error}`)
            .join('; ');
        super(`Split partially failed — ${failedLegs.length} leg(s) failed: ${summary}`);
        this.name = 'SplitPartialFailureError';
    }
}

/**
 * SplitExecutor — executes multi-hop routes and large-trade venue splits.
 *
 * Two modes:
 *   1. executeRoute:  Sequential multi-hop execution (output of hop N → input of hop N+1)
 *   2. executeSplit:  Parallel execution across multiple venues to reduce price impact.
 *                     Fix C-2: Throws SplitPartialFailureError if ANY leg fails, giving the
 *                     caller full visibility into which funds are stuck and why.
 */
export class SplitExecutor {
    private logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        transports: [new winston.transports.Console()],
    });

    constructor(private abstractor: BridgeAbstractor) {}

    /**
     * Executes all hops in a route sequentially.
     * Each hop's output feeds into the next hop's input.
     */
    async executeRoute(hops: Hop[]): Promise<SplitResult[]> {
        const results: SplitResult[] = [];

        for (let i = 0; i < hops.length; i++) {
            const hop = hops[i];
            this.logger.info(`Executing hop ${i + 1}/${hops.length} via ${hop.venue}`);

            try {
                const result = await this.abstractor.execute(hop);
                results.push({
                    hopIndex: i,
                    txHash:   result.txHash ?? '',
                    status:   result.status,
                    venue:    result.adapter,
                    fraction: 100n,
                    amount:   hop.estimatedOutput,
                });
                this.logger.info(`Hop ${i + 1} succeeded`, { txHash: result.txHash, venue: result.adapter });
            } catch (err: any) {
                this.logger.error(`Hop ${i + 1} failed — halting route`, { error: err.message });
                results.push({ hopIndex: i, txHash: '', status: 'failed', venue: hop.venue, error: err.message, fraction: 100n, amount: hop.estimatedOutput });
                break;
            }
        }

        return results;
    }

    /**
     * Splits a single large hop across multiple venues in parallel to reduce price impact.
     *
     * Fix C-2: If ANY leg fails, throws SplitPartialFailureError with full details.
     * The caller must catch this and record a 'partially_failed' status so the user knows
     * exactly what happened and which amounts may be stuck.
     *
     * @param hop    The base hop to split
     * @param splits Array of { venueName, fraction } where fractions sum to 100
     */
    async executeSplit(hop: Hop, splits: VenueSplit[]): Promise<SplitResult[]> {
        const totalFraction = splits.reduce((acc, s) => acc + s.fraction, 0n);
        if (totalFraction !== 100n) {
            throw new Error(`SplitExecutor: fractions must sum to 100, got ${totalFraction}`);
        }

        this.logger.info(`Executing split across ${splits.length} venues`, {
            splits: splits.map(s => `${s.venueName}:${s.fraction}%`).join(', ')
        });

        // Build parallel hops with proportional amounts
        const parallelHops = splits.map((s) => ({
            ...hop,
            venue:           s.venueName as Hop['venue'],
            estimatedOutput: (hop.estimatedOutput * s.fraction) / 100n,
        }));

        // Execute all legs in parallel
        const settled = await Promise.allSettled(
            parallelHops.map((h, i) =>
                this.abstractor.execute(h).then(r => ({
                    hopIndex: i,
                    txHash:   r.txHash ?? '',
                    status:   r.status,
                    venue:    r.adapter,
                    fraction: splits[i].fraction,
                    amount:   h.estimatedOutput,
                }))
            )
        );

        const results: SplitResult[] = settled.map((result, i): SplitResult => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                this.logger.error(`Split leg ${i} (${splits[i].venueName}) failed`, { error: result.reason });
                return {
                    hopIndex: i,
                    txHash:   '',
                    status:   'failed',
                    venue:    splits[i].venueName,
                    error:    result.reason?.message ?? 'Unknown error',
                    fraction: splits[i].fraction,
                    amount:   parallelHops[i].estimatedOutput,
                };
            }
        });

        const failedLegs    = results.filter(r => r.status === 'failed');
        const succeededLegs = results.filter(r => r.status !== 'failed');

        // Fix C-2: Throw a structured error if ANY leg failed.
        // This ensures callers MUST handle partial failure — it cannot be silently ignored.
        if (failedLegs.length > 0) {
            throw new SplitPartialFailureError(results, failedLegs, succeededLegs);
        }

        return results;
    }

    /**
     * Automatically determines split ratios based on available liquidity.
     * For now uses equal splits — in production this would query liquidity depth per venue.
     */
    static equalSplit(venues: string[]): VenueSplit[] {
        if (venues.length === 0) throw new Error('No venues provided for split');
        const perVenue = BigInt(Math.floor(100 / venues.length));
        const remainder = 100n - perVenue * BigInt(venues.length);

        return venues.map((venueName, i) => ({
            venueName,
            fraction: i === 0 ? perVenue + remainder : perVenue,
        }));
    }
}
