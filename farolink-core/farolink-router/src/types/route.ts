export type Token = {
    address: string;
    chainId: number;
    decimals: number;
    symbol: string;
    name?: string;
};

export type Hop = {
    fromChain: number;
    toChain: number;
    fromToken: Token;
    toToken: Token;
    venue: "pharos_spn" | "layerzero" | "chainlink_ccip" | "circle_cctp" | "dex_pool" | "axelar" | "wormhole" | "debridge" | "pharos-native" | string;
    poolAddress?: string;
    estimatedOutput: bigint;
    estimatedGas: bigint;
    slippageBps: number;
    latencyMs: number;
    bridgeFee?: bigint;
};

export type Route = {
    hops: Hop[];
    estimatedTotalOutput: bigint;
    totalGas: bigint;
    totalLatencyMs: number;
    overallRiskScore: number;
};

/**
 * Fix #5: RouteRequest now uses flat fromChain/toChain numbers and token address strings.
 * This matches how the API gateway proxies requests from clients and how PathFinder uses them.
 */
export type RouteRequest = {
    fromChain: number;
    toChain: number;
    fromToken: string;   // token address on source chain
    toToken: string;     // token address on destination chain
    amountIn: bigint;
    slippageToleranceBps: number;
    userAddress?: string;
    destinationUserAddress?: string; // Fix H-2: may differ from userAddress (e.g., Safe on dest chain)
};

export type RouteResponse = {
    amountIn: string;           // bigint serialized as string for JSON transport
    expectedOutput: string;     // bigint serialized as string
    totalGasEstimated: string;  // bigint serialized as string
    priceImpactBps: number;
    hops: Hop[];
    intentPayload?: {
        sourceUserAddress: string;
        destinationUserAddress: string;  // Fix H-2: always populated (may equal sourceUserAddress)
        sourceToken: string;
        destinationToken: string;
        amountIn: string;
        minAmountOut: string;
        sourceChainId: number;   // Fix M-6: source chain for EIP-712 domain
        targetChainId: number;
        deadline: number;
    };
};
