import { RouteRequest, RouteResponse, Hop } from '../types/route';
import { LiquidityGraph, GraphEdge } from '../graph/LiquidityGraph';
import { SlippageOracle } from './SlippageOracle';
import { ComplianceGate } from './ComplianceGate';
import { getTokenMeta } from '../config/TokenRegistry';

/**
 * Fix #6: Use a proper min-heap priority queue instead of array.sort().
 * TinyQueue provides O(log n) push/pop vs the previous O(n log n) per-iteration sort.
 * Also fixes the stale-entry bug by tracking best-known cost per node.
 */
class MinHeap<T extends { cost: number }> {
    private data: T[] = [];

    push(item: T): void {
        this.data.push(item);
        this._bubbleUp(this.data.length - 1);
    }

    pop(): T | undefined {
        if (this.data.length === 0) return undefined;
        const top = this.data[0];
        const last = this.data.pop()!;
        if (this.data.length > 0) {
            this.data[0] = last;
            this._sinkDown(0);
        }
        return top;
    }

    get length(): number { return this.data.length; }

    private _bubbleUp(i: number): void {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.data[parent].cost <= this.data[i].cost) break;
            [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
            i = parent;
        }
    }

    private _sinkDown(i: number): void {
        const n = this.data.length;
        while (true) {
            let smallest = i;
            const l = 2 * i + 1, r = 2 * i + 2;
            if (l < n && this.data[l].cost < this.data[smallest].cost) smallest = l;
            if (r < n && this.data[r].cost < this.data[smallest].cost) smallest = r;
            if (smallest === i) break;
            [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
            i = smallest;
        }
    }
}

interface PathNode {
    id:       string;  // format: "chainId:tokenAddress"
    cost:     number;
    depth:    number;  // Fix L-7: hop count from source, used for MAX_HOPS guard
    prev:     PathNode | null;
    edgeUsed: GraphEdge | null;
}

export class PathFinder {
    private slippageOracle = new SlippageOracle();
    private complianceGate = new ComplianceGate();

    constructor(private graph: LiquidityGraph) {}

    public async findBestRoute(request: RouteRequest): Promise<RouteResponse | null> {
        // Fix #5: RouteRequest now has flat fromChain/toChain + address strings
        const srcId = `${request.fromChain}:${request.fromToken.toLowerCase()}`;
        const tgtId = `${request.toChain}:${request.toToken.toLowerCase()}`;

        // Fix L-7: Maximum hops must match the on-chain contract limit (executePath allows ≤5)
        const MAX_HOPS = 5;

        // RWA Compliance check
        const compliance = this.complianceGate.analyzeForRWA(request.fromToken.toLowerCase());

        // Fix #6: Proper Dijkstra with min-heap + best-distance tracking
        const queue = new MinHeap<PathNode>();
        const dist  = new Map<string, number>();
        const visited = new Set<string>();

        queue.push({ id: srcId, cost: 0, depth: 0, prev: null, edgeUsed: null });
        dist.set(srcId, 0);

        let bestNode: PathNode | null = null;

        while (queue.length > 0) {
            const current = queue.pop()!;

            // Stale-entry check: skip if we've already found a cheaper path to this node
            if (current.cost > (dist.get(current.id) ?? Infinity)) continue;
            if (visited.has(current.id)) continue;
            visited.add(current.id);

            if (current.id === tgtId) {
                bestNode = current;
                break;
            }

            const neighbors = this.graph.getOutgoingEdges(current.id);

            for (const edge of neighbors) {
                // Fix L-7: Prune paths that would exceed the on-chain hop limit
                if (current.depth >= MAX_HOPS) continue;

                // RWA Rule Enforcement: drop unauthorized bridge edges
                if (compliance.isRwa && edge.venue !== "dex_pool" && !compliance.requiredVenues.includes(edge.venue)) {
                    continue;
                }

                let costAddition = edge.weight;

                // Fix #14 dependency: use real AMM slippage if reserves are available
                if (edge.venue === "dex_pool" && edge.reserves) {
                    const slip = this.slippageOracle.getSlippage(
                        edge.poolAddress ?? "0x0",
                        request.amountIn,
                        edge.reserves,
                        edge.reserves1 ?? edge.reserves,
                        edge.baseFee
                    );
                    costAddition += slip / 10000;
                }

                const newCost = current.cost + costAddition;

                // Only enqueue if this is a cheaper path to the neighbor
                if (newCost < (dist.get(edge.targetId) ?? Infinity)) {
                    dist.set(edge.targetId, newCost);
                    queue.push({
                        id: edge.targetId,
                        cost: newCost,
                        depth: current.depth + 1,
                        prev: current,
                        edgeUsed: edge
                    });
                }
            }
        }

        if (!bestNode) return null;

        // Reconstruct hops by backtracking from the target node
        const hops: Hop[] = [];
        let curr: PathNode | null = bestNode;

        // Fix #8: Track running output through hops so each hop has correct estimatedOutput
        // We'll compute forward after reconstruction
        const rawHops: Array<{ fromChain: string; toChain: string; fromTok: string; toTok: string; edge: GraphEdge }> = [];

        while (curr && curr.edgeUsed && curr.prev) {
            const [fromChain, fromTok] = curr.prev.id.split(':');
            const [toChain, toTok]     = curr.id.split(':');
            rawHops.unshift({ fromChain, toChain, fromTok, toTok, edge: curr.edgeUsed });
            curr = curr.prev;
        }

        // Fix #8: Forward pass — compute cumulative output per hop
        let runningOutput = request.amountIn;
        let totalGas = 0n;
        let totalLatencyMs = 0;
        let totalSlippageBps = 0;

        for (const raw of rawHops) {
            const { fromChain, toChain, fromTok, toTok, edge } = raw;

            // Fix #7: Use TokenRegistry for real symbols and decimals
            const fromMeta = getTokenMeta(fromTok);
            const toMeta   = getTokenMeta(toTok);

            const feeBps = BigInt(edge.baseFee);
            let hopOutput: bigint;

            // Use constant-product AMM formula when pool reserves are available.
            // x*y=k: amountOut = (reserve1 * amountInWithFee) / (reserve0 + amountInWithFee)
            // This correctly converts between tokens with different decimals (e.g. WETH→USDC).
            if (edge.venue === 'dex_pool' && edge.reserves && edge.reserves1 &&
                edge.reserves > 0n && edge.reserves1 > 0n) {
                const amountInWithFee = (runningOutput * (10000n - feeBps)) / 10000n;
                hopOutput = (edge.reserves1 * amountInWithFee) / (edge.reserves + amountInWithFee);
            } else {
                // Fallback: fee-only deduction (bridges, or pools without reserve data)
                hopOutput = (runningOutput * (10000n - feeBps)) / 10000n;
            }

            // Estimate per-venue gas
            const hopGas = edge.venue === "dex_pool" ? 150000n : 250000n;
            // Estimate per-venue latency (ms)
            const hopLatency = edge.venue === "dex_pool" ? 15000 : 120000;

            // Real slippage for this hop
            const slippageBps = edge.venue === "dex_pool" && edge.reserves && edge.reserves1
                ? this.slippageOracle.getSlippage(edge.poolAddress ?? "0x0", runningOutput, edge.reserves, edge.reserves1, Number(feeBps))
                : 0;

            hops.push({
                fromChain:       parseInt(fromChain),
                toChain:         parseInt(toChain),
                fromToken:       { chainId: parseInt(fromChain), address: fromTok, symbol: fromMeta.symbol, decimals: fromMeta.decimals, name: fromMeta.name },
                toToken:         { chainId: parseInt(toChain),   address: toTok,   symbol: toMeta.symbol,   decimals: toMeta.decimals,   name: toMeta.name   },
                venue:           edge.venue,
                poolAddress:     edge.poolAddress,
                estimatedOutput: hopOutput,
                estimatedGas:    hopGas,
                slippageBps,
                latencyMs:       hopLatency,
                bridgeFee:       edge.venue !== "dex_pool" ? (runningOutput * feeBps) / 10000n : 0n,
            });

            runningOutput     = hopOutput;
            totalGas         += hopGas;
            totalLatencyMs   += hopLatency;
            totalSlippageBps += slippageBps;
        }


        const slippageTolerance = BigInt(request.slippageToleranceBps ?? 50);  // default 0.5%
        const minAmountOut = (runningOutput * (10000n - slippageTolerance)) / 10000n;

        return {
            amountIn:          request.amountIn.toString(),
            expectedOutput:    runningOutput.toString(),
            totalGasEstimated: totalGas.toString(),
            priceImpactBps:    totalSlippageBps,
            hops,
            // Provide intent payload for SDK/frontend to sign
            intentPayload: request.userAddress ? {
                sourceUserAddress:      request.userAddress,
                // Fix H-2: use distinct destination address when provided (e.g. Safe on dest chain)
                destinationUserAddress: request.destinationUserAddress ?? request.userAddress,
                sourceToken:            request.fromToken,
                destinationToken:       request.toToken,
                amountIn:               request.amountIn.toString(),
                minAmountOut:           minAmountOut.toString(),
                sourceChainId:          request.fromChain,  // Fix M-6: source chain for EIP-712 domain
                targetChainId:          request.toChain,
                deadline:               Math.floor(Date.now() / 1000) + 1800,
            } : undefined,
        };
    }
}
