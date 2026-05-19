import { BridgeAdapter, BridgeInfo, BridgeTx, Hop } from "./BridgeAdapter";
import { ethers } from "ethers";

// deBridge DLN Source createOrder ABI (simplified for encoding)
const DLN_SOURCE_ABI = [
    "function createOrder(tuple(address giveTokenAddress, uint256 giveAmount, uint256 takeChainId, bytes takeTokenAddress, uint256 takeAmount, bytes receiverDst, address givePatchAuthoritySrc, bytes orderAuthorityAddressDst, bytes allowedTakerDst, bytes externalCall, bytes allowedCancelBeneficiarySrc) orderCreation, uint64 affiliateFee, uint32 referralCode, bytes permitEnvelope) payable"
];

import { getChainConfig } from "../config/env";

export class DeBridgeAdapter implements BridgeAdapter {
    readonly name = "debridge";

    getBridgeInfo(): BridgeInfo {
        return { name: this.name, fromChain: 1337, toChain: 1, latencyMs: 1100, feeBps: 2, riskScore: 0 };
    }

    async prepareTx(hop: Hop, sender: string): Promise<BridgeTx> {
        const config = getChainConfig(hop.fromChain);
        const dlnSource = config.bridges.debridge;
        if (!dlnSource || dlnSource === "") {
            throw new Error(`DEBRIDGE_DLN_ADDRESS not configured for chain ${hop.fromChain}`);
        }

        const abiCoder = ethers.AbiCoder.defaultAbiCoder();

        // deBridge DLN: 0-TVL intent-based model — no locked liquidity
        const minReceive = (hop.estimatedOutput * BigInt(10000 - hop.slippageBps)) / 10000n;

        const orderCreation = {
            giveTokenAddress:             hop.fromToken.address,
            giveAmount:                   hop.estimatedOutput,
            takeChainId:                  BigInt(hop.toChain),
            takeTokenAddress:             abiCoder.encode(['address'], [hop.toToken.address]),
            takeAmount:                   minReceive,
            receiverDst:                  abiCoder.encode(['address'], [sender]),
            givePatchAuthoritySrc:        sender,
            orderAuthorityAddressDst:     abiCoder.encode(['address'], [sender]),
            allowedTakerDst:              "0x",
            externalCall:                 "0x",
            allowedCancelBeneficiarySrc:  "0x",
        };

        const iface = new ethers.Interface(DLN_SOURCE_ABI);
        const data  = iface.encodeFunctionData("createOrder", [
            orderCreation,
            0n,   // affiliateFee
            0,    // referralCode
            "0x"  // permitEnvelope
        ]);

        return {
            to:          dlnSource,
            data,
            value:       await this.estimateFee(hop),
            description: `deBridge DLN 0-TVL order → chain ${hop.toChain}`
        };
    }

    async estimateFee(hop: Hop): Promise<bigint> {
        return 1200000000000000n; // 0.0012 ETH protocol fee; real: query deBridge stats API
    }

    async waitForDelivery(messageId: string, timeoutMs: number): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const res  = await fetch(`https://stats-api.dln.trade/api/Orders/${messageId}`);
                const data = await res.json() as any;
                if (data?.status === 'Fulfilled') return true;
            } catch {}
            await new Promise(r => setTimeout(r, 4000));
        }
        return false;
    }
}
