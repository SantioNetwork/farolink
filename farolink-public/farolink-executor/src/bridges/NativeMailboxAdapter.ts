import { BridgeAdapter, BridgeInfo, BridgeTx, Hop } from "./BridgeAdapter";
import { ethers } from "ethers";

// Pharos Native Mailbox dispatch ABI (Hyperlane-compatible)
const MAILBOX_ABI = [
    "function dispatch(uint32 destinationDomain, bytes32 recipientAddress, bytes calldata messageBody) payable returns (bytes32 messageId)"
];

// Pharos SPN domain IDs (Hyperlane-compatible domain mapping)
const PHAROS_DOMAIN: Record<number, number> = {
    1:      1,      // Ethereum
    1337:   1337,   // Pharos Testnet
    688689: 688689, // Pharos Atlantic Testnet
    137:    137,    // Polygon
    42161:  42161,  // Arbitrum
    8453:   8453,   // Base
    10:     10,     // Optimism
};

export class NativeMailboxAdapter implements BridgeAdapter {
    readonly name = "pharos-native";

    getBridgeInfo(): BridgeInfo {
        return { name: this.name, fromChain: 1337, toChain: 1, latencyMs: 1500, feeBps: 5, riskScore: 1 };
    }

    async prepareTx(hop: Hop, sender: string): Promise<BridgeTx> {
        if (hop.fromChain === hop.toChain) {
            throw new Error("pharos-native does not support same-chain transfers");
        }

        const mailbox = process.env.PHAROS_BRIDGE_ADDRESS;
        if (!mailbox || mailbox === "") {
            throw new Error("PHAROS_BRIDGE_ADDRESS not configured");
        }

        const destDomain = PHAROS_DOMAIN[hop.toChain];
        if (destDomain === undefined) {
            throw new Error(`No Pharos domain mapping for chain ${hop.toChain}`);
        }

        // Recipient address zero-padded to bytes32
        const recipientBytes32 = ethers.zeroPadValue(sender, 32);

        // Message body: ABI-encode the recipient and amount
        const messageBody = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'uint256'],
            [sender, hop.estimatedOutput]
        );

        const iface = new ethers.Interface(MAILBOX_ABI);
        const data  = iface.encodeFunctionData("dispatch", [
            destDomain,
            recipientBytes32,
            messageBody
        ]);

        return {
            to:          mailbox,
            data,
            value:       await this.estimateFee(hop),
            description: `Pharos SPN dispatch → domain ${destDomain}`
        };
    }

    async estimateFee(hop: Hop): Promise<bigint> {
        return 1500000000000000n; // 0.0015 ETH; real: call quoteDispatch() on the Mailbox
    }

    async waitForDelivery(messageId: string, timeoutMs: number): Promise<boolean> {
        // Poll Pharos Explorer for the SPN message delivery status
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const res  = await fetch(`https://testnet.pharosscan.io/api/v1/spn/${messageId}`);
                const data = await res.json() as any;
                if (data?.status === 'DELIVERED') return true;
            } catch {}
            await new Promise(r => setTimeout(r, 3000));
        }
        return false;
    }
}
