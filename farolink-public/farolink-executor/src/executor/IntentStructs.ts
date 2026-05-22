/**
 * IntentStructs — ERC-4337 UserOperation and BridgingIntent types.
 *
 * Fix #22: Field names and types now match the public SDK (farolink-sdk/src/types.ts).
 *   - Renamed targetUserAddress → destinationUserAddress
 *   - Renamed targetToken       → destinationToken
 *   - amountIn changed bigint  → string (wei as decimal string for JSON transport)
 *   - minAmountOut changed     → string
 *   - Added: targetChainId, deadline, signature
 *
 * The executor parses string amounts as BigInt internally where needed.
 */

export type UserOperation = {
    sender:               string;
    nonce:                bigint;
    initCode:             string;
    callData:             string;
    callGasLimit:         bigint;
    verificationGasLimit: bigint;
    preVerificationGas:   bigint;
    maxFeePerGas:         bigint;
    maxPriorityFeePerGas: bigint;
    paymasterAndData:     string;
    signature:            string;
};

export type BridgingIntent = {
    sourceUserAddress:      string;
    destinationUserAddress: string;  // Fix #22: was targetUserAddress
    sourceToken:            string;
    destinationToken:       string;  // Fix #22: was targetToken
    amountIn:               string;  // Fix #22: wei as decimal string (BigInt(amountIn) internally)
    minAmountOut:           string;  // Fix #22: wei as decimal string
    sourceChainId:          number;  // Added for dynamic executor routing
    targetChainId:          number;  // Fix #22: added — needed for routing context
    deadline:               number;  // unix timestamp
    signature?:             string;  // EIP-712 signature, required for execution
    // ERC-4337 UserOperation bundle
    userOp:                 UserOperation;
};
