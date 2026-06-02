import { RouteRequest, RouteResponse, Hop } from '../types/route';
import { LiquidityGraph, GraphEdge } from '../graph/LiquidityGraph';
import { SlippageOracle } from './SlippageOracle';
import { ComplianceGate } from './ComplianceGate';
import { getTokenMeta } from '../config/TokenRegistry';

/**
 * Simulates one hop and returns the output amount.
 *
 * For DEX pools: uses the constant-product AMM formula.
 *   The reserves already encode the correct decimal ratio between tokens,
 *   so no additional scaling is needed.
 *
 * For bridges: applies the fee deduction AND scales the amount to account
 *   for the decimal difference between the source token (on chain A) and
 *   the destination token (on chain B). Without this scaling, e.g. bridging
 *   USDC(BSC, 18 dec) → USDC(Pharos, 6 dec) would produce an amount that
 *   is 10^12 times too large, making the path appear artificially superior.
 */
function simulateHop(edge: GraphEdge, amountIn: bigint): bigint {
    const feeBps = BigInt(edge.baseFee);

    if (edge.venue === 'dex_pool' && edge.reserves && edge.reserves1 &&
        edge.reserves > 0n && edge.reserves1 > 0n) {
        // Constant-product AMM: reserves already reflect the correct price ratio.
        const amountInWithFee = (amountIn * (10000n - feeBps)) / 10000n;
        return (edge.reserves1 * amountInWithFee) / (edge.reserves + amountInWithFee);
    }

    // Bridge hop: apply fee then scale for decimal difference.
    const afterFee = (amountIn * (10000n - feeBps)) / 10000n;

    // Determine decimal places for source and destination tokens.
    const [, fromTok] = edge.sourceId.split(':');
    const [, toTok]   = edge.targetId.split(':');
    const fromDec = getTokenMeta(fromTok).decimals;
    const toDec   = getTokenMeta(toTok).decimals;

    const decDiff = toDec - fromDec;
    if (decDiff === 0) return afterFee;
    if (decDiff > 0)  return afterFee * (10n ** BigInt(decDiff));
    return afterFee / (10n ** BigInt(-decDiff));
}

function getPathWeight(path: GraphEdge[]): number {
    return path.reduce((sum, edge) => sum + edge.weight, 0);
}

function comparePaths(pathA: GraphEdge[], pathB: GraphEdge[], outA: bigint, outB: bigint): number {
    if (outA === 0n && outB === 0n) return 0;
    if (outA === 0n) return 1;  // B is better
    if (outB === 0n) return -1; // A is better

    // Use ratio in basis points to compare (avoids floating point).
    const ratioBps = (outA * 10000n) / outB;
    if (ratioBps > 10100n) return -1; // A gives >1% more — pick A
    if (ratioBps < 9900n)  return 1;  // B gives >1% more — pick B

    // Outputs within 1%: prefer the path with lower cumulative weight
    // (fewer hops, lower latency, lower bridge risk).
    const weightA = getPathWeight(pathA);
    const weightB = getPathWeight(pathB);
    if (weightA < weightB) return -1;
    if (weightB < weightA) return 1;
    return 0;
}

export class PathFinder {
    private slippageOracle = new SlippageOracle();
    private complianceGate = new ComplianceGate();

    constructor(private graph: LiquidityGraph) {}

    public async findBestRoute(request: RouteRequest): Promise<RouteResponse | null> {
        const srcId = `${request.fromChain}:${request.fromToken.toLowerCase()}`;
        const tgtId = `${request.toChain}:${request.toToken.toLowerCase()}`;

        const MAX_HOPS = 5;

        // RWA Compliance check
        const compliance = this.complianceGate.analyzeForRWA(request.fromToken.toLowerCase());

        // DFS: collect all simple paths from srcId → tgtId (up to MAX_HOPS hops)
        const allPaths: GraphEdge[][] = [];
        const visited = new Set<string>([srcId]);
        this.findAllPaths(srcId, tgtId, MAX_HOPS, compliance, visited, [], allPaths);

        // Simulate each path and find the best one
        let bestPath: GraphEdge[] | null = null;
        let bestOutput = 0n;

        for (const path of allPaths) {
            let runningOutput = request.amountIn;
            let valid = true;

            for (const edge of path) {
                runningOutput = simulateHop(edge, runningOutput);
                if (runningOutput <= 0n) { valid = false; break; }
            }
            if (!valid) continue;

            if (!bestPath) {
                bestPath    = path;
                bestOutput  = runningOutput;
            } else {
                const cmp = comparePaths(path, bestPath, runningOutput, bestOutput);
                if (cmp < 0) {
                    bestPath   = path;
                    bestOutput = runningOutput;
                }
            }
        }

        if (!bestPath) return null;

        // Reconstruct hops from the optimal path
        const hops: Hop[] = [];
        let runningOutput = request.amountIn;
        let totalGas = 0n;
        let totalLatencyMs = 0;
        let totalSlippageBps = 0;

        for (const edge of bestPath) {
            const [fromChain, fromTok] = edge.sourceId.split(':');
            const [toChain, toTok]     = edge.targetId.split(':');

            const fromMeta = getTokenMeta(fromTok);
            const toMeta   = getTokenMeta(toTok);
            const feeBps   = BigInt(edge.baseFee);

            const hopOutput = simulateHop(edge, runningOutput);

            const hopGas     = edge.venue === "dex_pool" ? 150000n : 250000n;
            const hopLatency = edge.venue === "dex_pool" ? 15000   : 120000;

            const slippageBps = edge.venue === "dex_pool" && edge.reserves && edge.reserves1
                ? this.slippageOracle.getSlippage(
                    edge.poolAddress ?? "0x0",
                    runningOutput,
                    edge.reserves,
                    edge.reserves1,
                    Number(feeBps)
                  )
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

        const slippageTolerance = BigInt(request.slippageToleranceBps ?? 50);
        const minAmountOut = (runningOutput * (10000n - slippageTolerance)) / 10000n;

        return {
            amountIn:          request.amountIn.toString(),
            expectedOutput:    runningOutput.toString(),
            totalGasEstimated: totalGas.toString(),
            priceImpactBps:    totalSlippageBps,
            hops,
            intentPayload: request.userAddress ? {
                sourceUserAddress:      request.userAddress,
                destinationUserAddress: request.destinationUserAddress ?? request.userAddress,
                sourceToken:            request.fromToken,
                destinationToken:       request.toToken,
                amountIn:               request.amountIn.toString(),
                minAmountOut:           minAmountOut.toString(),
                sourceChainId:          request.fromChain,
                targetChainId:          request.toChain,
                deadline:               Math.floor(Date.now() / 1000) + 1800,
            } : undefined,
        };
    }

    private findAllPaths(
        currentId:   string,
        targetId:    string,
        maxHops:     number,
        compliance:  any,
        visited:     Set<string>,
        currentPath: GraphEdge[],
        allPaths:    GraphEdge[][]
    ): void {
        if (currentId === targetId) {
            allPaths.push([...currentPath]);
            return;
        }
        if (currentPath.length >= maxHops) return;

        const edges = this.graph.getOutgoingEdges(currentId);
        
        // Group and filter edges to prevent parallel bridge path explosion.
        // For DEX pools, we keep all of them.
        // For bridge edges, we only keep the single best compliant bridge edge to each unique targetId.
        const filteredEdges: GraphEdge[] = [];
        const bestBridgeMap = new Map<string, GraphEdge>();

        for (const edge of edges) {
            if (edge.venue === 'dex_pool') {
                filteredEdges.push(edge);
            } else {
                // RWA compliance check
                if (compliance.isRwa && !compliance.requiredVenues.includes(edge.venue)) {
                    continue;
                }
                const existing = bestBridgeMap.get(edge.targetId);
                if (!existing || edge.weight < existing.weight) {
                    bestBridgeMap.set(edge.targetId, edge);
                }
            }
        }

        for (const edge of bestBridgeMap.values()) {
            filteredEdges.push(edge);
        }

        for (const edge of filteredEdges) {
            if (!visited.has(edge.targetId)) {
                visited.add(edge.targetId);
                currentPath.push(edge);
                this.findAllPaths(edge.targetId, targetId, maxHops, compliance, visited, currentPath, allPaths);
                currentPath.pop();
                visited.delete(edge.targetId);
            }
        }
    }
}
