import { BridgeAdapter, BridgeInfo, BridgeTx, Hop } from "./BridgeAdapter";
import { ethers } from "ethers";

// LayerZero v2 OFT send() ABI
const LZ_SEND_ABI = [
    "function send(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, tuple(uint256 nativeFee, uint256 lzTokenFee) fee, address refundAddress) payable"
];

// LayerZero v2 OFT quoteSend() ABI — returns (MessagingFee fee)
const LZ_QUOTE_ABI = [
    "function quoteSend(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, bool payInLzToken) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee) fee)"
];

// LayerZero chain ID → Endpoint ID mapping
const LZ_EID_MAP: Record<number, number> = {
    1:      30101,  // Ethereum
    1337:   30261,  // Pharos Testnet
    137:    30109,  // Polygon
    42161:  30110,  // Arbitrum
    8453:   30184,  // Base
    43114:  30106,  // Avalanche
};

// Hardcoded fallback in case quoteSend() RPC call fails
const LZ_FEE_FALLBACK = 2000000000000000n; // 0.002 ETH

import { getChainConfig } from "../config/env";

export class LayerZeroAdapter implements BridgeAdapter {
    readonly name = "layerzero";

    getBridgeInfo(): BridgeInfo {
        return { name: this.name, fromChain: 1337, toChain: 1, latencyMs: 2000, feeBps: 5, riskScore: 2 };
    }

    async prepareTx(hop: Hop, sender: string): Promise<BridgeTx> {
        const config = getChainConfig(hop.fromChain);
        const endpoint = config.bridges.layerzero;
        if (!endpoint || endpoint === "0x0" || endpoint === "") {
            throw new Error(`LAYERZERO_ENDPOINT_ADDRESS not configured for chain ${hop.fromChain}`);
        }

        const dstEid    = LZ_EID_MAP[hop.toChain];
        if (!dstEid) throw new Error(`No LayerZero EID for chain ${hop.toChain}`);

        const toBytes32 = ethers.zeroPadValue(sender, 32);

        const sendParam = {
            dstEid,
            to:           toBytes32,
            amountLD:     hop.estimatedOutput,
            minAmountLD:  (hop.estimatedOutput * BigInt(10000 - hop.slippageBps)) / 10000n,
            extraOptions: "0x",
            composeMsg:   "0x",
            oftCmd:       "0x",
        };

        // Fix M-5: Use real quoteSend() fee, fall back to constant only on RPC error.
        const fee = await this.estimateFee(hop, endpoint, sendParam);

        const iface = new ethers.Interface(LZ_SEND_ABI);
        const data  = iface.encodeFunctionData("send", [
            sendParam,
            { nativeFee: fee, lzTokenFee: 0n },
            sender
        ]);

        return { to: endpoint, data, value: fee, description: `LayerZero OFT Transfer → chain ${hop.toChain}` };
    }

    /**
     * Fix M-5: Calls quoteSend() on the OFT contract to get the real cross-chain messaging fee.
     * Falls back to a hardcoded conservative estimate only if the RPC call fails.
     */
    async estimateFee(
        hop: Hop,
        oftAddress?: string,
        sendParam?: object,
    ): Promise<bigint> {
        const config = getChainConfig(hop.fromChain);
        const rpcUrl = config.rpcUrl;
        const address = oftAddress ?? config.bridges.layerzero;
        if (!rpcUrl || !address || !sendParam) {
            return LZ_FEE_FALLBACK;
        }
        try {
            const provider  = new ethers.JsonRpcProvider(rpcUrl);
            const contract  = new ethers.Contract(address, LZ_QUOTE_ABI, provider);
            const result    = await contract.quoteSend(sendParam, false);
            // result.fee.nativeFee is the ETH required for LayerZero messaging
            const nativeFee = BigInt(result.fee.nativeFee.toString());
            return nativeFee > 0n ? nativeFee : LZ_FEE_FALLBACK;
        } catch {
            // RPC call failed (e.g. contract not deployed yet, testnet unreachable)
            // Fall back to conservative estimate so execution can still proceed.
            return LZ_FEE_FALLBACK;
        }
    }

    async waitForDelivery(messageId: string, timeoutMs: number): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const res  = await fetch(`https://api-testnet.layerzero-scan.com/tx/${messageId}`);
                const data = await res.json() as any;
                if (data?.messages?.[0]?.status === 'DELIVERED') return true;
            } catch {}
            await new Promise(r => setTimeout(r, 3000));
        }
        return false;
    }
}
