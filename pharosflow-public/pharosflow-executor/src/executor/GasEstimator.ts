import { ethers } from "ethers";
import { BridgeTx } from "../bridges/BridgeAdapter";

/**
 * GasEstimator — real RPC-based gas estimation.
 * Fix #19: Replaces hardcoded 50000n / 250000n gas estimates in BridgeAbstractor.
 */
export class GasEstimator {
    constructor(private provider: ethers.JsonRpcProvider) {}

    /**
     * Estimates gas for a transaction against the RPC node.
     * Adds a configurable buffer to prevent under-estimation reverts.
     *
     * @param tx         The transaction to simulate
     * @param sender     The sending wallet address
     * @param bufferPct  Buffer percentage to add (default 20%)
     * @returns          Gas limit with buffer (bigint)
     */
    async estimate(tx: BridgeTx, sender: string, bufferPct = 20n): Promise<bigint> {
        try {
            const estimated = await this.provider.estimateGas({
                to:    tx.to,
                data:  tx.data,
                value: tx.value ?? 0n,
                from:  sender
            });
            // Add buffer: estimated * (100 + bufferPct) / 100
            return (estimated * (100n + bufferPct)) / 100n;
        } catch (err) {
            // Simulation failed (likely due to insufficient allowance or missing setup)
            // Fall back to a conservative gas limit rather than crashing
            return 500000n;
        }
    }

    /**
     * Returns current EIP-1559 gas prices from the RPC node.
     */
    async getGasPrice(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
        const feeData = await this.provider.getFeeData();
        return {
            maxFeePerGas:         feeData.maxFeePerGas         ?? 20000000000n, // 20 Gwei fallback
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 1500000000n,  // 1.5 Gwei fallback
        };
    }
}
