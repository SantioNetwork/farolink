import { BridgeAdapter } from "./BridgeAdapter";
import { NativeMailboxAdapter } from "./NativeMailboxAdapter";
import { LayerZeroAdapter } from "./LayerZeroAdapter";
import { CCIPAdapter } from "./CCIPAdapter";
import { CCTPAdapter } from "./CCTPAdapter";
import { AxelarAdapter } from "./AxelarAdapter";
import { WormholeAdapter } from "./WormholeAdapter";
import { DeBridgeAdapter } from "./DeBridgeAdapter";

export class BridgeRegistry {
    private adapters: BridgeAdapter[] = [];

    constructor() {
        this.register(new NativeMailboxAdapter());
        this.register(new LayerZeroAdapter());
        this.register(new CCIPAdapter());
        this.register(new CCTPAdapter());
        this.register(new AxelarAdapter());
        this.register(new WormholeAdapter());
        this.register(new DeBridgeAdapter());
    }

    register(adapter: BridgeAdapter): void {
        this.adapters.push(adapter);
    }

    getAllAdapters(): BridgeAdapter[] {
        return this.adapters;
    }

    getAdapterByName(name: string): BridgeAdapter | undefined {
        const normKey = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normMap: Record<string, string> = {
            "pharosbridge": "pharos-native",
            "pharosnative": "pharos-native",
            "layerzero": "layerzero",
            "debridge": "debridge",
            "chainlinkccip": "chainlink_ccip",
            "circlecttp": "circle_cctp",
            "axelar": "axelar",
            "wormhole": "wormhole"
        };
        const targetName = normMap[normKey] ?? name;
        return this.adapters.find((a) => a.name === targetName);
    }
}

export const bridgeRegistry = new BridgeRegistry();
