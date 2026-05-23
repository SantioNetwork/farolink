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
            retryStrategy:        (times) => Math.min(times * 50, 2000),
            connectTimeout:       10000,
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

        this.redis.on('connect', () => { 
            this.redisOk = true; 
            console.log('[LiquidityGraph] Successfully connected to Upstash Redis!');
            if (resolveConnect) resolveConnect();
        });
        
        this.redis.on('error', (err) => { 
            this.redisOk = false;
            // Suppress verbose reconnect logs but keep it failing gracefully
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
        const _edges: GraphEdge[] = [];
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

                        // Base 0.3% fee + slippage proxy weight
                        const weight = 1.003; 

                        _edges.push({
                            sourceId,
                            targetId,
                            venue: "dex_pool",
                            weight,
                            baseFee: 30, // 30 bps
                            poolAddress: pairAddress,
                            reserves:  reserve0,
                            reserves1: reserve1  // Fix: carry both reserves for AMM math
                        });

                        _edges.push({
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
                         // Error parsing cache, skip
                    }
                }
            } while (cursor !== '0');
        } catch (e) {
            console.error('[LiquidityGraph] Redis loading failed:', e);
            // Redis unavailable — return empty; bridge edges still serve routing
        }
        return _edges;
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
