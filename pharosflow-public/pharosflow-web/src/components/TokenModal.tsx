import React, { useState, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import type { TokenInfo } from '../lib/tokenList';
import { TOKENS } from '../lib/tokenList';

interface Props {
    isOpen:   boolean;
    onClose:  () => void;
    onSelect: (token: TokenInfo) => void;
    excluded?: string;
}

const TAGS = [
    { key: '',            label: 'All'       },
    { key: 'stablecoin', label: 'Stables'   },
    { key: 'lst',        label: 'LST / LRT' },
    { key: 'rwa',        label: 'RWA'       },
];

const CHAINS = [
    { id: 0,      name: 'All Networks' },
    { id: 688689, name: 'Pharos' },
    { id: 1,      name: 'Ethereum' },
    { id: 42161,  name: 'Arbitrum' },
    { id: 10,     name: 'Optimism' },
    { id: 8453,   name: 'Base' },
    { id: 137,    name: 'Polygon' },
    { id: 56,     name: 'BNB Chain' }
];

const FALLBACK_SVG = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36'><circle cx='18' cy='18' r='18' fill='%2327272a'/></svg>`;

export default function TokenModal({ isOpen, onClose, onSelect, excluded }: Props) {
    const [search, setSearch]   = useState('');
    const [activeTag, setActiveTag] = useState('');
    const [activeChain, setActiveChain] = useState<number>(0);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return TOKENS.filter(t => {
            if (activeChain !== 0 && t.chainId !== activeChain) return false;
            if (excluded && t.address.toLowerCase() === excluded.toLowerCase()) return false;
            if (activeTag && !t.tags?.includes(activeTag)) return false;
            if (!q) return true;
            return (
                t.symbol.toLowerCase().includes(q) ||
                t.name.toLowerCase().includes(q) ||
                t.address.toLowerCase() === q
            );
        });
    }, [search, activeTag, activeChain, excluded]);

    if (!isOpen) return null;

    const handleSelect = (token: TokenInfo) => {
        onSelect(token);
        setSearch('');
        setActiveTag('');
        setActiveChain(0);
    };

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal aria-label="Select token">
            <div className="modal-box" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="modal-header">
                    <span className="modal-title">Select Token</span>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* Search */}
                <div className="modal-search">
                    <div style={{ position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
                        <input
                            id="token-search-input"
                            placeholder="Search symbol, name, or address…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ paddingLeft: 36 }}
                            autoFocus
                        />
                    </div>
                </div>

                {/* Network & Tag Filters */}
                <div className="modal-chain-filter" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                        {CHAINS.map(c => (
                            <button
                                key={c.id}
                                className={`chain-filter-btn ${activeChain === c.id ? 'active' : ''}`}
                                onClick={() => setActiveChain(c.id)}
                            >
                                {c.name}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {TAGS.map(tag => (
                                <button
                                    key={tag.key}
                                    className={`chain-filter-btn ${activeTag === tag.key ? 'active' : ''}`}
                                    onClick={() => setActiveTag(tag.key)}
                                >
                                    {tag.label}
                                </button>
                            ))}
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-4)' }}>
                            {filtered.length} token{filtered.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>

                {/* Token List */}
                <div className="modal-token-list">
                    {filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-4)', padding: '32px 20px', fontSize: '0.875rem' }}>
                            No tokens found
                            {search && <div style={{ marginTop: 4, fontSize: '0.78rem' }}>Try a symbol, name, or paste an address</div>}
                        </div>
                    ) : (
                        filtered.map(token => (
                            <div
                                key={`${token.chainId}-${token.address}`}
                                className="modal-token-item"
                                onClick={() => handleSelect(token)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={e => e.key === 'Enter' && handleSelect(token)}
                            >
                                <img
                                    src={token.logoURI}
                                    alt={token.symbol}
                                    className="token-logo"
                                    onError={e => { (e.target as HTMLImageElement).src = FALLBACK_SVG; }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {token.symbol}
                                        <span style={{ fontSize: '0.65rem', padding: '1px 6px', background: 'var(--bg-2)', borderRadius: 10, color: 'var(--text-3)', fontWeight: 500 }}>
                                            {CHAINS.find(c => c.id === token.chainId)?.name ?? token.chainId}
                                        </span>
                                    </div>
                                    <div className="token-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {token.name}
                                    </div>
                                </div>
                                {token.tags?.map(tag => (
                                    <span key={tag} className="token-chain-badge">{tag}</span>
                                ))}
                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: 'var(--text-4)', marginLeft: 4 }}>
                                    {token.address.slice(0, 6)}…{token.address.slice(-4)}
                                </span>
                            </div>
                        ))
                    )}
                </div>

            </div>
        </div>
    );
}
