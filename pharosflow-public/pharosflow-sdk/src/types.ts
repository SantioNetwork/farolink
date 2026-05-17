/**
 * SDK Types — public interface for the PharosFlow API.
 *
 * Fix #22: Canonical type definitions — the executor's IntentStructs.ts now mirrors these.
 * Fix #44: Added StatusResponse, getStatus, and trackIntent method types.
 */

export interface RouteRequest {
    fromChain:              number;
    toChain:                number;
    fromToken:              string;  // token address on source chain
    toToken:                string;  // token address on destination chain
    amountIn:               string;  // wei as decimal string
    slippageToleranceBps?:  number;  // e.g. 50 = 0.5%
    userAddress?:           string;
    // Fix H-2: Optional distinct destination address (e.g. Safe multisig on dest chain)
    destinationUserAddress?: string;
}

export interface Token {
    address:  string;
    chainId:  number;
    symbol:   string;
    decimals: number;
    name?:    string;
}

export interface Hop {
    fromChain:       number;
    toChain:         number;
    fromToken:       Token;
    toToken:         Token;
    venue:           string;
    estimatedOutput: string;
    estimatedGas:    string;
    slippageBps:     number;
    latencyMs:       number;
    bridgeFee?:      string;
}

export interface RouteResponse {
    amountIn:          string;
    expectedOutput:    string;
    totalGasEstimated: string;
    priceImpactBps:    number;
    hops:              Hop[];
    intentPayload?:    BridgingIntent;
}

export interface BridgingIntent {
    sourceUserAddress:      string;
    destinationUserAddress: string;
    sourceToken:            string;
    destinationToken:       string;
    amountIn:               string;   // wei as decimal string
    minAmountOut:           string;   // wei as decimal string (slippage floor)
    // Fix M-6: sourceChainId is the chain where the user signs — required for correct EIP-712 domain
    sourceChainId:          number;
    targetChainId:          number;
    deadline:               number;   // unix timestamp
    maxGasFee?:             string;
    signature?:             string;   // EIP-712 signature. Required for /execute.
}

export interface ExecutionResponse {
    intentHash?:   string;
    trackingHash?: string;  // Use this with getStatus() / trackIntent()
    txHash?:       string;
    status:        string;
    error?:        string;
}

/** Fix #44: Bridge delivery tracking response */
export interface StatusResponse {
    trackingHash:       string;
    status:             'PENDING' | 'BROADCASTING' | 'DELIVERED' | 'FAILED';
    bridgeVenue:        string;
    sourceChainId:      number;
    destinationChainId: number;
    amount:             string;
    feeCollected:       string;
    errorMessage?:      string;
    createdAt:          string;
    updatedAt:          string;
}

export interface ClientConfig {
    /** B2B Enterprise API key — enables higher rate limits */
    apiKey?:    string;
    /** Override the default production API URL */
    apiUrl?:    string;
    /** Request timeout in ms (default: 30_000) */
    timeoutMs?: number;
}
