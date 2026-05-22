// Mock file since BridgeRegistry is supposed to be in executor repo
// L2 needs to be aware of what the bridge registry returns

export type BridgeInfo = {
    name: string;
    fromChain: number;
    toChain: number;
    latencyMs: number;
    feeBps: number;
    riskScore: number; // 0-10, lower = safer
};

export interface BridgeAdapter {
    name: string;
    getBridgeInfo(): BridgeInfo;
}

export class BridgeRegistry {
    private adapters: BridgeAdapter[] = [];
    register(adapter: BridgeAdapter) { this.adapters.push(adapter); }
    getAllAdapters(): BridgeAdapter[] { return this.adapters; }
    getAdapterByName(name: string): BridgeAdapter | undefined { return this.adapters.find(a => a.name === name); }
}

export const bridgeRegistry = new BridgeRegistry();

// ─── Auto-register testnet adapters for rigorous cross-chain testing ───────
const CHAINS = [1, 10, 56, 137, 8453, 42161, 688689];

for (let i = 0; i < CHAINS.length; i++) {
    for (let j = 0; j < CHAINS.length; j++) {
        if (i === j) continue;
        const fromChain = CHAINS[i]!;
        const toChain = CHAINS[j]!;

        // Pharos Native Bridge (Fastest, cheapest)
        bridgeRegistry.register({
            name: "PharosBridge",
            getBridgeInfo: () => ({ name: "PharosBridge", fromChain, toChain, latencyMs: 5000, feeBps: 1, riskScore: 0 })
        });

        // LayerZero (Standard)
        bridgeRegistry.register({
            name: "LayerZero",
            getBridgeInfo: () => ({ name: "LayerZero", fromChain, toChain, latencyMs: 120000, feeBps: 5, riskScore: 2 })
        });

        // deBridge DLN (Fast liquidity network)
        bridgeRegistry.register({
            name: "deBridge",
            getBridgeInfo: () => ({ name: "deBridge", fromChain, toChain, latencyMs: 15000, feeBps: 3, riskScore: 1 })
        });

        // Chainlink CCIP (Highly secure)
        bridgeRegistry.register({
            name: "ChainlinkCCIP",
            getBridgeInfo: () => ({ name: "ChainlinkCCIP", fromChain, toChain, latencyMs: 180000, feeBps: 8, riskScore: 1 })
        });

        // Circle CCTP (USDC native)
        bridgeRegistry.register({
            name: "CircleCCTP",
            getBridgeInfo: () => ({ name: "CircleCCTP", fromChain, toChain, latencyMs: 60000, feeBps: 0, riskScore: 1 })
        });

        // Axelar (General message passing)
        bridgeRegistry.register({
            name: "Axelar",
            getBridgeInfo: () => ({ name: "Axelar", fromChain, toChain, latencyMs: 45000, feeBps: 6, riskScore: 3 })
        });

        // Wormhole
        bridgeRegistry.register({
            name: "Wormhole",
            getBridgeInfo: () => ({ name: "Wormhole", fromChain, toChain, latencyMs: 60000, feeBps: 8, riskScore: 4 })
        });
    }
}
