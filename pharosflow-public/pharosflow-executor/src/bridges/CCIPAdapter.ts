import { BridgeAdapter, BridgeInfo, BridgeTx, Hop } from "./BridgeAdapter";
import { ethers } from "ethers";

// Chainlink CCIP Router ccipSend ABI
const CCIP_ROUTER_ABI = [
    "function ccipSend(uint64 destinationChainSelector, tuple(bytes receiver, bytes data, tuple(address token, uint256 amount)[] tokenAmounts, address feeToken, bytes extraArgs) message) payable returns (bytes32)"
];

// Chainlink CCIP chain selectors
const CCIP_SELECTOR: Record<number, bigint> = {
    1:      5009297550715157269n,   // Ethereum
    137:    4051577828743386545n,   // Polygon
    42161:  4949039107694359620n,   // Arbitrum
    10:     3734403246176062136n,   // Optimism
    8453:   15971525489660198786n,  // Base
    43114:  6433500567565415381n,   // Avalanche
};

import { getChainConfig } from "../config/env";

export class CCIPAdapter implements BridgeAdapter {
    readonly name = "chainlink_ccip";

    getBridgeInfo(): BridgeInfo {
        return { name: this.name, fromChain: 1337, toChain: 1, latencyMs: 1500, feeBps: 2, riskScore: 2 };
    }

    async prepareTx(hop: Hop, sender: string): Promise<BridgeTx> {
        const config = getChainConfig(hop.fromChain);
        const router = config.bridges.chainlink_ccip;
        if (!router || router === "") {
            throw new Error(`CHAINLINK_CCIP_ROUTER not configured for chain ${hop.fromChain}`);
        }

        const destSelector = CCIP_SELECTOR[hop.toChain];
        if (!destSelector) {
            throw new Error(`No CCIP chain selector for chain ${hop.toChain}`);
        }

        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const fee      = await this.estimateFee(hop);

        const message = {
            receiver:     abiCoder.encode(['address'], [sender]),
            data:         "0x",
            tokenAmounts: [{ token: hop.fromToken.address, amount: hop.estimatedOutput }],
            feeToken:     ethers.ZeroAddress,  // Pay fee in native token
            extraArgs:    "0x",
        };

        const iface = new ethers.Interface(CCIP_ROUTER_ABI);
        const data  = iface.encodeFunctionData("ccipSend", [destSelector, message]);

        return { to: router, data, value: fee, description: `CCIP send → selector ${destSelector}` };
    }

    async estimateFee(hop: Hop): Promise<bigint> {
        return 1500000000000000n; // 0.0015 ETH fallback; real: call getFee() on router
    }

    async waitForDelivery(messageId: string, timeoutMs: number): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const res  = await fetch(`https://ccip.chain.link/api/h/atlas/requests/${messageId}`);
                const data = await res.json() as any;
                if (data?.data?.state === 'SUCCESS') return true;
            } catch {}
            await new Promise(r => setTimeout(r, 5000));
        }
        return false;
    }
}
