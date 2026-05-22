import { BridgeAdapter, BridgeInfo, BridgeTx, Hop } from "./BridgeAdapter";
import { ethers } from "ethers";

// Axelar Gateway sendToken ABI
const AXELAR_GATEWAY_ABI = [
    "function sendToken(string calldata destinationChain, string calldata destinationAddress, string calldata symbol, uint256 amount)"
];

// Axelar chain name strings (not numeric IDs)
const AXELAR_CHAIN: Record<number, string> = {
    1:      "ethereum",
    137:    "polygon",
    42161:  "arbitrum",
    10:     "optimism",
    8453:   "base",
    43114:  "avalanche",
    56:     "binance",
};

export class AxelarAdapter implements BridgeAdapter {
    readonly name = "axelar";

    getBridgeInfo(): BridgeInfo {
        return { name: this.name, fromChain: 1337, toChain: 1, latencyMs: 1800, feeBps: 4, riskScore: 2 };
    }

    async prepareTx(hop: Hop, sender: string): Promise<BridgeTx> {
        const gateway = process.env.AXELAR_GATEWAY_ADDRESS;
        if (!gateway || gateway === "") {
            throw new Error("AXELAR_GATEWAY_ADDRESS not configured");
        }

        const destChain = AXELAR_CHAIN[hop.toChain];
        if (!destChain) {
            throw new Error(`No Axelar chain name for chain ID ${hop.toChain}`);
        }

        const iface = new ethers.Interface(AXELAR_GATEWAY_ABI);
        const data  = iface.encodeFunctionData("sendToken", [
            destChain,
            sender,                    // destination address (string)
            hop.fromToken.symbol,      // token symbol (e.g. "USDC")
            hop.estimatedOutput
        ]);

        return {
            to:          gateway,
            data,
            value:       await this.estimateFee(hop),
            description: `Axelar sendToken(${hop.fromToken.symbol}) → ${destChain}`
        };
    }

    async estimateFee(hop: Hop): Promise<bigint> {
        return 1800000000000000n; // 0.0018 ETH fallback; real: query Axelar Gas Service API
    }

    async waitForDelivery(messageId: string, timeoutMs: number): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const res  = await fetch(`https://api.axelarscan.io/gmp/searchGMP?txHash=${messageId}`);
                const data = await res.json() as any;
                const status = data?.data?.[0]?.status;
                if (status === 'executed' || status === 'destination_executed') return true;
            } catch {}
            await new Promise(r => setTimeout(r, 4000));
        }
        return false;
    }
}
