import React from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { Wallet, ChevronDown, LogOut, Loader } from 'lucide-react';

function shortAddress(addr: string) {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const CHAIN_NAMES: Record<number, string> = {
    688689: 'Pharos',
    1:      'Ethereum',
    137:    'Polygon',
    42161:  'Arbitrum',
    8453:   'Base',
};

export default function WalletButton() {
    const { address, isConnected, isConnecting } = useAccount();
    const { connect }    = useConnect();
    const { disconnect } = useDisconnect();
    const chainId        = useChainId();
    const [open, setOpen] = React.useState(false);
    const ref            = React.useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    if (isConnecting) {
        return (
            <button className="wallet-btn" disabled>
                <Loader size={14} className="spinning" />
                Connecting…
            </button>
        );
    }

    if (!isConnected) {
        return (
            <button
                id="connect-wallet-btn"
                className="wallet-btn"
                onClick={() => connect({ connector: injected() })}
            >
                <Wallet size={15} />
                Connect Wallet
            </button>
        );
    }

    const chainName = CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                id="wallet-connected-btn"
                className="wallet-btn connected"
                onClick={() => setOpen(o => !o)}
            >
                <span className="dot" />
                {shortAddress(address!)}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 400, marginLeft: 2 }}>
                    {chainName}
                </span>
                <ChevronDown size={13} />
            </button>

            {open && (
                <div style={{
                    position:   'absolute',
                    top:        'calc(100% + 8px)',
                    right:       0,
                    background: 'var(--bg-surface)',
                    border:     '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow:  'var(--shadow-lg)',
                    minWidth:   200,
                    overflow:   'hidden',
                    zIndex:     200,
                }}>
                    {/* Address */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '0.82rem' }}>
                        <div style={{ color: 'var(--text-3)', marginBottom: 4 }}>Connected as</div>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-1)', fontWeight: 500, fontSize: '0.8rem' }}>
                            {address}
                        </div>
                    </div>

                    {/* Disconnect */}
                    <button
                        id="disconnect-btn"
                        onClick={() => { disconnect(); setOpen(false); }}
                        style={{
                            width:      '100%',
                            background: 'none',
                            border:     'none',
                            padding:    '12px 16px',
                            color:      'var(--danger)',
                            cursor:     'pointer',
                            display:    'flex',
                            alignItems: 'center',
                            gap:         8,
                            fontSize:   '0.875rem',
                            fontWeight: 500,
                            transition: 'background var(--transition)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-dim)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                        <LogOut size={14} /> Disconnect
                    </button>
                </div>
            )}
        </div>
    );
}
