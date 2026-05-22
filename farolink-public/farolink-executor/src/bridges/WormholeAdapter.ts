import { BridgeAdapter, BridgeInfo, BridgeTx, Hop } from "./BridgeAdapter";
import { ethers } from "ethers";

// Wormhole Token Bridge transferTokens ABI
const WORMHOLE_BRIDGE_ABI = [
    "function transferTokens(address token, uint256 amount, uint16 recipientChain, bytes32 recipient, uint256 arbiterFee, uint32 nonce) payable returns (uint64 sequence)"
];

// Wormhole chain IDs (different from EVM chain IDs)
const WORMHOLE_CHAIN_ID: Record<number, number> = {
    1:      2,   // Ethereum
    137:    5,   // Polygon
    42161:  23,  // Arbitrum
    10:     24,  // Optimism
    8453:   30,  // Base
    43114:  6,   // Avalanche
    56:     4,   // BSC
    1337:   10008, // Pharos Testnet (placeholder)
};

export class WormholeAdapter implements BridgeAdapter {
    readonly name = "wormhole";

    getBridgeInfo(): BridgeInfo {
        return { name: this.name, fromChain: 1337, toChain: 1, latencyMs: 1600, feeBps: 3, riskScore: 2 };
    }

    async prepareTx(hop: Hop, sender: string): Promise<BridgeTx> {
        const bridge = process.env.WORMHOLE_BRIDGE_ADDRESS;
        if (!bridge || bridge === "") {
            throw new Error("WORMHOLE_BRIDGE_ADDRESS not configured");
        }

        const recipientChain = WORMHOLE_CHAIN_ID[hop.toChain];
        if (!recipientChain) {
            throw new Error(`No Wormhole chain ID for EVM chain ${hop.toChain}`);
        }

        // Recipient must be bytes32 (zero-padded EVM address)
        const recipient = ethers.zeroPadValue(sender, 32);
        const fee       = await this.estimateFee(hop);
        // Nonce — use timestamp-derived for uniqueness (NonceManager handles TX nonces separately)
        const nonce     = Math.floor(Date.now() / 1000) & 0xFFFFFFFF;

        const iface = new ethers.Interface(WORMHOLE_BRIDGE_ABI);
        const data  = iface.encodeFunctionData("transferTokens", [
            hop.fromToken.address,
            hop.estimatedOutput,
            recipientChain,
            recipient,
            0n,       // arbiterFee (0 for direct transfers)
            nonce
        ]);

        return {
            to:          bridge,
            data,
            value:       fee,
            description: `Wormhole transferTokens → chain ${recipientChain}`
        };
    }

    async estimateFee(hop: Hop): Promise<bigint> {
        return 1600000000000000n; // 0.0016 ETH fallback; real: call messageFee() on Wormhole core
    }

    async waitForDelivery(messageId: string, timeoutMs: number): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const res  = await fetch(`https://api.wormholescan.io/api/v1/transactions/${messageId}`);
                const data = await res.json() as any;
                if (data?.data?.status === 'completed') return true;
            } catch {}
            await new Promise(r => setTimeout(r, 4000));
        }
        return false;
    }
}
