import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from './lib/wagmi';
import App from './App';
import './index.css';
import { assertTokenAddressesAreReal } from './lib/tokenList';
// Fix M-2: Only assert in production builds — wrap in try/catch to never crash the app
try { assertTokenAddressesAreReal(); } catch (e) { console.error(e); }

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,   // Route quotes stale after 30s
            gcTime:    5 * 60_000,
        }
    }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>
        </WagmiProvider>
    </React.StrictMode>
);
