/**
 * SDK Types — public interface for the FaroLink API.
 *
 * These are the canonical type definitions for FaroLink SDK consumers.
 * The executor's IntentStructs.ts and API gateway schemas mirror these types.
 *
 * Audit v2: Added missing fields (routeScore, mevProtection, poolAddress,
 * destinationUserAddress on RouteRequest, ComplianceResponse), tightened
 * optional vs required constraints, and documented every field.
 */

// ─── Route Request / Response ─────────────────────────────────────────────────

export interface RouteRequest {
    /** Source chain ID (e.g. 1 = Ethereum, 688689 = Pharos Atlantic) */
    fromChain:              number;
    /** Destination chain ID */
    toChain:                number;
    /** ERC-20 token address on source chain (0x-prefixed, 40 hex chars) */
    fromToken:              string;
    /** ERC-20 token address on destination chain */
    toToken:                string;
    /** Amount in wei as a decimal string (no "0x", no decimals) */
    amountIn:               string;
    /** Max acceptable slippage in basis points (e.g. 50 = 0.5%). Defaults to 50. */
    slippageToleranceBps?:  number;
    /** Sender's wallet address. Required to receive a signable intentPayload. */
    userAddress?:           string;
    /** Optional distinct destination address (e.g. Safe multisig on dest chain).
     *  Defaults to `userAddress` if omitted. */
    destinationUserAddress?: string;
}

export interface Token {
    /** ERC-20 contract address (0x-prefixed, 40 hex chars) */
    address:  string;
    /** Chain ID this token lives on */
    chainId:  number;
    /** Ticker symbol (e.g. "USDC", "WETH") */
    symbol:   string;
    /** Token decimals (e.g. 6 for USDC, 18 for WETH) */
    decimals: number;
    /** Human-readable token name (e.g. "USD Coin") */
    name?:    string;
}

export interface Hop {
    fromChain:       number;
    toChain:         number;
    fromToken:       Token;
    toToken:         Token;
    /** Venue identifier (e.g. "dex_pool", "pharos-native", "layerzero") */
    venue:           string;
    /** DEX pool contract address — present for dex_pool venue hops */
    poolAddress?:    string;
    /** Expected output amount as a decimal string (wei) */
    estimatedOutput: string;
    /** Estimated gas cost as a decimal string (gas units) */
    estimatedGas:    string;
    /** Slippage estimate in basis points */
    slippageBps:     number;
    /** Estimated latency for this hop in milliseconds */
    latencyMs:       number;
    /** Bridge fee in wei (only present for cross-chain bridge hops) */
    bridgeFee?:      string;
}

/** MEV protection assessment returned with every route */
export interface MEVProtection {
    /** Risk severity: 'low' | 'medium' | 'high' */
    riskLevel:      string;
    /** Whether this route is at meaningful MEV risk */
    isAtRisk:       boolean;
    /** Human-readable explanation of the risk assessment */
    reason:         string;
    /** Whether a private RPC (e.g. Flashbots) should be used for submission */
    usePrivateRpc:  boolean;
}

export interface RouteResponse {
    /** Input amount as a decimal string (wei) */
    amountIn:          string;
    /** Best-path expected output as a decimal string (wei) */
    expectedOutput:    string;
    /** Cumulative gas estimate as a decimal string (gas units) */
    totalGasEstimated: string;
    /** Cumulative price impact in basis points */
    priceImpactBps:    number;
    /** Ordered list of hops in the optimal path */
    hops:              Hop[];
    /** Route quality score (0–100). Higher is better. */
    routeScore?:       number;
    /** MEV risk assessment for this route */
    mevProtection?:    MEVProtection;
    /** Pre-built intent payload, ready to sign. Present only when `userAddress` was provided. */
    intentPayload?:    BridgingIntent;
}

// ─── Intent Signing / Execution ───────────────────────────────────────────────

export interface BridgingIntent {
    /** Sender's wallet address (the signer) */
    sourceUserAddress:      string;
    /** Recipient address on the destination chain. Defaults to sourceUserAddress. */
    destinationUserAddress: string;
    /** Source token address */
    sourceToken:            string;
    /** Destination token address */
    destinationToken:       string;
    /** Amount in wei as a decimal string */
    amountIn:               string;
    /** Minimum acceptable output in wei as a decimal string (slippage floor) */
    minAmountOut:           string;
    /** Chain ID where the user signs — used for EIP-712 domain */
    sourceChainId:          number;
    /** Destination chain ID */
    targetChainId:          number;
    /** Unix timestamp (seconds) after which the intent is invalid */
    deadline:               number;
    /** Optional max gas fee the user is willing to pay (wei as decimal string) */
    maxGasFee?:             string;
    /** EIP-712 signature. Populated by `signIntent()`. Required for `/v1/execute`. */
    signature?:             string;
}

// ─── Execution / Status Tracking ──────────────────────────────────────────────

export interface ExecutionResponse {
    /** Deterministic hash of the signed intent */
    intentHash?:   string;
    /** Tracking hash for status polling via `getStatus()` / `trackIntent()` */
    trackingHash?: string;
    /** On-chain transaction hash (if already broadcasted) */
    txHash?:       string;
    /** Execution status */
    status:        string;
    /** Error message (only present on failure) */
    error?:        string;
}

/** Bridge delivery status, as returned by `/v1/status/:trackingHash` */
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

// ─── Compliance ───────────────────────────────────────────────────────────────

/** Compliance/KYC data for an address on a specific chain */
export interface ComplianceResponse {
    /** The queried address */
    address:         string;
    /** The queried chain ID */
    chainId:         number;
    /** Whether the address has completed KYC */
    isKYCed:         boolean;
    /** AML risk level (e.g. "low", "medium", "high") */
    amlRisk:         string;
    /** Whether the address is flagged for RWA-only routes */
    isRwa:           boolean;
    /** Bridge venues required for this address's compliance profile */
    requiredBridges: string[];
    /** Permitted jurisdictions */
    jurisdictions:   string[];
}

// ─── Client Configuration ─────────────────────────────────────────────────────

export interface ClientConfig {
    /** B2B Enterprise API key — enables higher rate limits */
    apiKey?:    string;
    /** Override the default production API URL */
    apiUrl?:    string;
    /** Per-request timeout in ms (default: 30_000) */
    timeoutMs?: number;
}

// ─── Tracking Options ─────────────────────────────────────────────────────────

export interface TrackIntentOptions {
    /** Maximum total polling duration in ms (default: 300_000 = 5 minutes) */
    timeoutMs?:       number;
    /** Interval between status polls in ms (default: 5_000 = 5 seconds) */
    pollIntervalMs?:  number;
    /** AbortSignal to cancel polling externally (e.g. on component unmount) */
    signal?:          AbortSignal;
}
