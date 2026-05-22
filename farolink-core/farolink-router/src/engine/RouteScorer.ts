import { Route } from '../types/route';

interface ScorerWeights {
    feesWeight:     number;  // 0–1, default 0.40
    slippageWeight: number;  // 0–1, default 0.30
    latencyWeight:  number;  // 0–1, default 0.20
    riskWeight:     number;  // 0–1, default 0.10
}

const DEFAULT_WEIGHTS: ScorerWeights = {
    feesWeight:     0.40,
    slippageWeight: 0.30,
    latencyWeight:  0.20,
    riskWeight:     0.10,
};

/**
 * RouteScorer — multi-factor weighted route scoring.
 * Fix #13: Replaces the trivial latency-only scorer with a proper utility function.
 *
 * Scoring model:
 *   - Fees:     0 bps = 100pts, 100 bps = 0pts
 *   - Slippage: 0 bps = 100pts, 200 bps = 0pts
 *   - Latency:  0 ms = 100pts, 30000 ms = 0pts
 *   - Risk:     0/10 = 100pts, 10/10 = 0pts
 *
 * Score range: 0–100. HIGHER = BETTER route.
 */
export class RouteScorer {
    constructor(private weights: ScorerWeights = DEFAULT_WEIGHTS) {
        const total = weights.feesWeight + weights.slippageWeight + weights.latencyWeight + weights.riskWeight;
        if (Math.abs(total - 1.0) > 0.001) {
            throw new Error(`RouteScorer: weights must sum to 1.0, got ${total.toFixed(3)}`);
        }
    }

    /**
     * Returns a score from 0–100. Higher is better.
     */
    public scoreRoute(route: Route): number {
        // Fee score: sum of all bridge fees in bps (approx — actual fee is in wei but baseFee is bps)
        const totalFeeBps = route.hops.reduce((acc, h) => acc + (h.slippageBps ?? 0), 0);
        const feeScore = Math.max(0, Math.min(100, 100 - (totalFeeBps / 100) * 100));

        // Slippage score
        const totalSlippageBps = route.hops.reduce((acc, h) => acc + (h.slippageBps ?? 0), 0);
        const slippageScore = Math.max(0, Math.min(100, 100 - (totalSlippageBps / 200) * 100));

        // Latency score
        const latencyScore = Math.max(0, Math.min(100, 100 - (route.totalLatencyMs / 30000) * 100));

        // Risk score (overallRiskScore is 0–10 scale)
        const riskScore = Math.max(0, Math.min(100, 100 - route.overallRiskScore * 10));

        return (
            feeScore      * this.weights.feesWeight     +
            slippageScore * this.weights.slippageWeight  +
            latencyScore  * this.weights.latencyWeight   +
            riskScore     * this.weights.riskWeight
        );
    }

    /**
     * Given multiple routes, returns the index of the best-scoring one.
     */
    public selectBest(routes: Route[]): number {
        if (routes.length === 0) return -1;
        let bestIdx   = 0;
        let bestScore = -Infinity;

        routes.forEach((route, i) => {
            const score = this.scoreRoute(route);
            if (score > bestScore) {
                bestScore = score;
                bestIdx   = i;
            }
        });

        return bestIdx;
    }

    /**
     * Returns all routes ranked from best to worst with their scores attached.
     */
    public rankRoutes(routes: Route[]): Array<{ route: Route; score: number; rank: number }> {
        return routes
            .map(route => ({ route, score: this.scoreRoute(route) }))
            .sort((a, b) => b.score - a.score)
            .map((item, i) => ({ ...item, rank: i + 1 }));
    }
}
