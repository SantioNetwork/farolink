import Redis from 'ioredis';
import { env } from '../config/env';
import { Hop, Token } from '../types/route';
import { bridgeRegistry } from '../bridges/BridgeRegistry';
import { TOKENS } from './tokenRegistry';

export interface GraphEdge {
    sourceId: string;    // format: chainId:tokenAddress
    targetId: string;
    venue: string;
    weight: number;
    baseFee: number;     // bps
    reserves?: bigint;   // reserve0 (input token)
    reserves1?: bigint;  // reserve1 (output token) — added for AMM price impact calculation
    poolAddress?: string;
}

export class LiquidityGraph {
    private redis: Redis;
    private redisOk = false;
    private edges: Map<string, GraphEdge[]> = new Map(); // sourceId -> outgoing edges
    private connectPromise: Promise<void>;

    constructor() {
        this.redis = new Redis(env.REDIS_URL, {
            maxRetriesPerRequest: 1,
            retryStrategy: (times) => {
                if (times > 5) {
                    console.warn(`[LiquidityGraph] Redis reconnect failed after ${times} attempts — giving up`);
                    return null; // stop retrying
                }
                return Math.min(times * 500, 5000);
            },
            connectTimeout:       10000,
            enableOfflineQueue:   false,   // fail commands immediately when disconnected
            family:               4,
            tls:                  { rejectUnauthorized: false }
        });
        
        const connectTimeoutPromise = new Promise<void>((resolve) => {
            setTimeout(resolve, 5000); // 5 seconds max wait
        });

        let resolveConnect: () => void;
        const mainConnectPromise = new Promise<void>((resolve) => {
            resolveConnect = resolve;
        });

        this.connectPromise = Promise.race([mainConnectPromise, connectTimeoutPromise]);

        // 'connect' fires on socket open; 'ready' fires after auth — only then can we issue commands.
        // With enableOfflineQueue: false, running SCAN between connect→ready throws immediately.
        this.redis.on('connect', () => {
            console.log('[LiquidityGraph] Redis socket connected, waiting for ready...');
        });

        let hasLoggedReady = false;
        this.redis.on('ready', () => { 
            this.redisOk = true; 
            if (!hasLoggedReady) {
                console.log('[LiquidityGraph] Successfully connected to Upstash Redis!');
                hasLoggedReady = true;
            }
            if (resolveConnect) resolveConnect();
        });
        
        this.redis.on('error', (err) => { 
            this.redisOk = false;
            // Log rate-limit errors once, suppress reconnect spam
            const msg = (err as Error).message ?? '';
            if (msg.includes('max requests limit')) {
                console.warn('[LiquidityGraph] Upstash rate limit hit — serving from cached graph');
            }
        });

        this.redis.on('end', () => {
            this.redisOk = false;
            console.warn('[LiquidityGraph] Redis connection closed — serving from cached graph');
        });
    }

    public async refreshGraph() {
        // Wait for connection to be ready (or timeout) on refresh
        await this.connectPromise;

        const newEdges: Map<string, GraphEdge[]> = new Map();

        // 1. Load static Cross-Chain Bridges
        const bridgeEdges = this.loadBridgeEdges();
        this.incorporateEdges(newEdges, bridgeEdges);

        // 2. Load dynamic DEX Liquidity from Redis (written by L1)
        if (this.redisOk) {
            const dexEdges = await this.loadDexEdgesFromRedis();
            this.incorporateEdges(newEdges, dexEdges);
        } else if (this.edges.size > 0) {
            // Redis unavailable — preserve existing DEX edges from last successful load
            // so the router can continue serving from its cached graph
            for (const [key, edgeList] of this.edges) {
                for (const edge of edgeList) {
                    if (edge.venue === 'dex_pool') {
                        this.incorporateEdges(newEdges, [edge]);
                    }
                }
            }
            console.log('[LiquidityGraph] Redis unavailable — preserved cached DEX edges');
        }

        // Atomic swap
        this.edges = newEdges;
    }

    private incorporateEdges(graph: Map<string, GraphEdge[]>, edges: GraphEdge[]) {
        for (const edge of edges) {
            if (!graph.has(edge.sourceId)) graph.set(edge.sourceId, []);
            graph.get(edge.sourceId)!.push(edge);
        }
    }

    private loadBridgeEdges(): GraphEdge[] {
        const _edges: GraphEdge[] = [];
        const adapters = bridgeRegistry.getAllAdapters();
        
        // Group all registered tokens by symbol to find cross-chain counterparts
        const tokensBySymbol = new Map<string, typeof TOKENS>();
        for (const token of TOKENS) {
            if (!tokensBySymbol.has(token.symbol)) tokensBySymbol.set(token.symbol, []);
            tokensBySymbol.get(token.symbol)!.push(token);
        }

        for (const adapter of adapters) {
            const info = adapter.getBridgeInfo();
            
            // Weight = Base fee normalized + Risk Penalties
            let weight = 1.0 + (info.feeBps / 10000) + (info.latencyMs / 100000);
            
            // 0-TVL bias implementation (deduct weight to make path "shorter")
            if (info.riskScore === 0) {
                weight -= 0.5; // Massive preference
            } else {
                weight += (info.riskScore * 0.2); // Penalty for high risk
            }

            // Find all tokens that exist on BOTH the source and target chains of this bridge adapter
            for (const [symbol, symbolTokens] of tokensBySymbol.entries()) {
                const sourceToken = symbolTokens.find(t => t.chainId === info.fromChain);
                const targetToken = symbolTokens.find(t => t.chainId === info.toChain);
                
                if (sourceToken && targetToken) {
                    const sourceId = `${info.fromChain}:${sourceToken.address.toLowerCase()}`;
                    const targetId = `${info.toChain}:${targetToken.address.toLowerCase()}`;
                    
                    _edges.push({
                        sourceId,
                        targetId,
                        venue: adapter.name,
                        weight: Math.max(weight, 0.1), // Prevent negative cycle
                        baseFee: info.feeBps
                    });
                }
            }
        }
        return _edges;
    }

    private async loadDexEdgesFromRedis(): Promise<GraphEdge[]> {
        const rawEdges: GraphEdge[] = [];
        try {
            let cursor = '0';
            do {
                const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'liquidity:*', 'COUNT', 100);
                cursor = nextCursor;

                if (keys.length === 0) continue;

                // Batch fetch all pool values in a single request!
                const values = await this.redis.mget(keys);

                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    const dataStr = values[i];
                    if (!dataStr) continue;

                    try {
                        const data = JSON.parse(dataStr);
                        // key format: liquidity:chainId:pairAddress
                        const [_prefix, chainId, pairAddress] = key.split(':');
                        
                        const sourceId = `${chainId}:${data.token0.toLowerCase()}`;
                        const targetId = `${chainId}:${data.token1.toLowerCase()}`;
                        const reverseSourceId = `${chainId}:${data.token1.toLowerCase()}`;
                        const reverseTargetId = `${chainId}:${data.token0.toLowerCase()}`;

                        const reserve0 = BigInt(data.reserves[0]);
                        const reserve1 = BigInt(data.reserves[1]);

                        // Skip empty pools
                        if (reserve0 === 0n || reserve1 === 0n) continue;

                        const isMock = pairAddress?.includes('mockpool') ?? false;

                        // Base 0.3% fee + slippage proxy weight
                        const weight = 1.003; 

                        rawEdges.push({
                            sourceId,
                            targetId,
                            venue: "dex_pool",
                            weight,
                            baseFee: 30, // 30 bps
                            poolAddress: pairAddress,
                            reserves:  reserve0,
                            reserves1: reserve1  // Fix: carry both reserves for AMM math
                        });

                        rawEdges.push({
                            sourceId: reverseSourceId,
                            targetId: reverseTargetId,
                            venue: "dex_pool",
                            weight,
                            baseFee: 30,
                            poolAddress: pairAddress,
                            reserves:  reserve1,
                            reserves1: reserve0  // Fix: swap reserves for reverse direction
                        });
                    } catch (e) {
                        console.warn(`[LiquidityGraph] Skipping pool ${key}: ${(e as Error).message}`);
                    }
                }
            } while (cursor !== '0');
        } catch (e) {
            console.error('[LiquidityGraph] Redis loading failed:', e);
            // Redis unavailable — return empty; bridge edges still serve routing
        }

        // ── Pool deduplication: prefer mock pools over distorted testnet pools ──
        // Testnet pools often have wildly imbalanced reserves from random users,
        // making them appear as arbitrage opportunities. Mock pools are seeded at
        // market-rate prices and should be preferred for accurate quoting.
        const _edges = this.deduplicateEdges(rawEdges);
        console.log(`[LiquidityGraph] Loaded ${_edges.length / 2} DEX pools from Redis (${_edges.length} directed edges, ${rawEdges.length - _edges.length} filtered)`);
        return _edges;
    }

    /**
     * Deduplicates edges: when both a mock pool and a real testnet pool exist
     * for the same token pair (sourceId → targetId), keep only the mock pool.
     * This prevents distorted testnet pools from producing unrealistic quotes.
     */
    private deduplicateEdges(edges: GraphEdge[]): GraphEdge[] {
        // Group by directed pair: sourceId→targetId
        const pairMap = new Map<string, GraphEdge[]>();
        for (const edge of edges) {
            const pairKey = `${edge.sourceId}→${edge.targetId}`;
            if (!pairMap.has(pairKey)) pairMap.set(pairKey, []);
            pairMap.get(pairKey)!.push(edge);
        }

        const result: GraphEdge[] = [];
        for (const [pairKey, pairEdges] of pairMap.entries()) {
            const mockEdges = pairEdges.filter(e => e.poolAddress?.includes('mockpool'));
            const realEdges = pairEdges.filter(e => !e.poolAddress?.includes('mockpool'));

            if (mockEdges.length > 0) {
                // Mock pool exists → use it (market-rate priced), skip distorted real pools
                result.push(...mockEdges);
            } else {
                // No mock pool → use real pools, but skip extremely imbalanced ones
                // (reserve ratio > 10000:1 suggests testnet manipulation)
                for (const edge of realEdges) {
                    if (edge.reserves && edge.reserves1) {
                        const r0 = edge.reserves;
                        const r1 = edge.reserves1;
                        // Normalize: compare in same magnitude (shift smaller up)
                        const ratio = r0 > r1 ? r0 / (r1 || 1n) : r1 / (r0 || 1n);
                        if (ratio > 10000n) {
                            console.warn(`[LiquidityGraph] Skipping imbalanced pool ${edge.poolAddress} (ratio ${ratio})`);
                            continue;
                        }
                    }
                    result.push(edge);
                }
            }
        }
        return result;
    }

    public getOutgoingEdges(nodeId: string): GraphEdge[] {
        return this.edges.get(nodeId) || [];
    }

    public getGraphSnapshot() {
        return { nodes: this.edges.size };
    }

    public disconnect() {
        this.redis.disconnect();
    }
}
