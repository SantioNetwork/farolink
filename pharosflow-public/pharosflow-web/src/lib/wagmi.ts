import { createConfig, http } from 'wagmi';
import { mainnet, polygon, arbitrum, base, optimism, bsc } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import { type Chain } from 'viem';

// Pharos Testnet chain definition
const pharosTestnet = {
    id: 688688,
    name: 'Pharos Testnet',
    nativeCurrency: { name: 'Pharos', symbol: 'PHRS', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://testnet.dplabs-internal.com'] },
        public:  { http: ['https://testnet.dplabs-internal.com'] },
    },
    blockExplorers: {
        default: { name: 'PharosScan', url: 'https://testnet.pharosscan.xyz' }
    },
    testnet: true,
} as const satisfies Chain;

export const SUPPORTED_CHAINS = [pharosTestnet, mainnet, polygon, arbitrum, base, optimism, bsc] as const;

export const wagmiConfig = createConfig({
    chains: SUPPORTED_CHAINS,
    connectors: [
        injected({ shimDisconnect: true }),
        walletConnect({
            projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'pharosflow-dev',
            metadata: {
                name:        'PharosFlow',
                description: 'Cross-chain intent routing on the Pharos Network',
                url:         'https://pharosflow.net',
                icons:       ['https://pharosflow.net/icon.png'],
            }
        }),
    ],
    transports: {
        [pharosTestnet.id]: http(),
        [mainnet.id]:       http(),
        [polygon.id]:       http(),
        [arbitrum.id]:      http(),
        [base.id]:          http(),
        [optimism.id]:      http(),
        [bsc.id]:           http(),
    },
});

export { pharosTestnet };
