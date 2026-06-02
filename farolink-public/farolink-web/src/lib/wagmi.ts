import { createConfig, http } from 'wagmi';
import { mainnet, polygon, arbitrum, base, optimism, bsc } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import { type Chain } from 'viem';

// Pharos Atlantic Testnet (chainId 688689)
const pharosTestnet = {
    id: 688689,
    name: 'Pharos Atlantic Testnet',
    nativeCurrency: { name: 'Pharos', symbol: 'PHRS', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://atlantic.dplabs-internal.com'] },
        public:  { http: ['https://atlantic.dplabs-internal.com'] },
    },
    blockExplorers: {
        default: { name: 'PharosScan', url: 'https://testnet.pharosscan.xyz' }
    },
    testnet: true,
} as const satisfies Chain;

// Pharos Pacific Mainnet (chainId 1672) — user's MetaMask may be on this chain
const pharosMainnet = {
    id: 1672,
    name: 'Pharos Pacific Mainnet',
    nativeCurrency: { name: 'PROS', symbol: 'PROS', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://rpc.pharos.xyz'] },
        public:  { http: ['https://rpc.pharos.xyz'] },
    },
    blockExplorers: {
        default: { name: 'PharosScan', url: 'https://www.pharosscan.xyz' }
    },
} as const satisfies Chain;

export const SUPPORTED_CHAINS = [pharosTestnet, pharosMainnet, mainnet, polygon, arbitrum, base, optimism, bsc] as const;

export const wagmiConfig = createConfig({
    chains: SUPPORTED_CHAINS,
    connectors: [
        injected({ shimDisconnect: true }),
        walletConnect({
            projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'farolink-dev',
            metadata: {
                name:        'FaroLink',
                description: 'Cross-chain intent routing on the Pharos Network',
                url:         'https://farolink.xyz',
                icons:       ['https://farolink.xyz/favicon.svg'],
            }
        }),
    ],
    transports: {
        [pharosTestnet.id]:  http(),
        [pharosMainnet.id]:  http(),
        [mainnet.id]:        http(),
        [polygon.id]:        http(),
        [arbitrum.id]:       http(),
        [base.id]:           http(),
        [optimism.id]:       http(),
        [bsc.id]:            http(),
    },
});

export { pharosTestnet, pharosMainnet };
