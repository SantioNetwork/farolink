export type Token = {
    address: string;
    chainId: number;
    decimals: number;
    symbol: string;
};

export type Hop = {
    fromChain: number;
    toChain: number;
    fromToken: Token;
    toToken: Token;
    venue: "pharos-native" | "pharos_spn" | "layerzero" | "chainlink_ccip" | "circle_cctp" | "axelar" | "wormhole" | "debridge";
    poolAddress?: string;
    amountIn?: bigint;           // Raw input amount (used when estimatedOutput is not yet known)
    estimatedOutput: bigint;     // Expected output after fees/slippage
    estimatedGas: bigint;
    slippageBps: number;
    latencyMs: number;
    bridgeFee?: bigint;
    recipient?: string;          // Override destination address (defaults to sender)
};

export type BridgeInfo = {
    name: string;
    fromChain: number;
    toChain: number;
    latencyMs: number;
    feeBps: number;
    riskScore: number; // 0-10
};

export type BridgeTx = {
    to: string;            // contract address to call
    data: string;          // calldata (hex)
    value?: bigint;        // msg.value if any
    description?: string;  // optional debug text
};

export interface BridgeAdapter {
    /** Human-readable name */
    readonly name: string;
  
    /** Returns metadata used by the routing graph */
    getBridgeInfo(): BridgeInfo;
  
    /** Prepares a transaction payload for a single hop */
    prepareTx(hop: Hop, sender: string): Promise<BridgeTx>;
  
    /** Estimates the fee (in native token) for this hop */
    estimateFee(hop: Hop): Promise<bigint>;
  
    /** Called after the transaction is submitted - polls for delivery */
    waitForDelivery(messageId: string, timeoutMs: number): Promise<boolean>;
}
