import { BridgeAdapter, BridgeInfo, BridgeTx, Hop } from "./BridgeAdapter";
import { ethers } from "ethers";

// Circle CCTP TokenMessenger ABI — depositForBurn
const CCTP_ABI = [
    "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64 nonce)"
];

// Circle CCTP domain IDs per chain
const CCTP_DOMAIN: Record<number, number> = {
    1:     0,   // Ethereum
    43114: 1,   // Avalanche
    10:    2,   // Optimism
    42161: 3,   // Arbitrum
    8453:  6,   // Base
    137:   7,   // Polygon
    688689: 31,  // Pharos Atlantic Testnet
};

// USDC contract addresses per chain (CCTP only works with native USDC)
const USDC_ADDRESS: Record<number, string> = {
    1:     "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    8453:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    137:   "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

import { getChainConfig } from "../config/env";

export class CCTPAdapter implements BridgeAdapter {
    readonly name = "circle_cctp";

    getBridgeInfo(): BridgeInfo {
        return { name: this.name, fromChain: 1337, toChain: 1, latencyMs: 1200, feeBps: 3, riskScore: 3 };
    }

    async prepareTx(hop: Hop, sender: string): Promise<BridgeTx> {
        const config = getChainConfig(hop.fromChain);
        const messenger = config.bridges.circle_cctp;
        if (!messenger || messenger === "") {
            throw new Error(`CIRCLE_CCTP_MESSENGER not configured for chain ${hop.fromChain}`);
        }

        const destDomain = CCTP_DOMAIN[hop.toChain];
        if (destDomain === undefined) {
            throw new Error(`No CCTP domain for chain ${hop.toChain}`);
        }

        const burnToken = USDC_ADDRESS[hop.fromChain] ?? hop.fromToken.address;

        // mintRecipient must be bytes32 (zero-padded address)
        const mintRecipient = ethers.zeroPadValue(sender, 32);

        const iface = new ethers.Interface(CCTP_ABI);
        const data  = iface.encodeFunctionData("depositForBurn", [
            hop.estimatedOutput,
            destDomain,
            mintRecipient,
            burnToken
        ]);

        // CCTP does not take a native fee — fee is deducted from the USDC amount
        return { to: messenger, data, value: 0n, description: `Circle CCTP burn → domain ${destDomain}` };
    }

    async estimateFee(hop: Hop): Promise<bigint> {
        return 0n; // CCTP charges no native fee
    }

    async waitForDelivery(messageId: string, timeoutMs: number): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        const ATTESTATION_API = "https://iris-api-sandbox.circle.com/attestations";

        while (Date.now() < deadline) {
            try {
                const res  = await fetch(`${ATTESTATION_API}/${messageId}`);
                const data = await res.json() as any;
                if (data?.status === 'complete') return true;
            } catch {}
            await new Promise(r => setTimeout(r, 5000));
        }
        return false;
    }
}
