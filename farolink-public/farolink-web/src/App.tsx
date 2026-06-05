import React, { useState } from 'react';
import { Waves, Code2, FileText, Shield } from 'lucide-react';
import SwapWidget from './components/SwapWidget';
import TransactionHistory from './components/TransactionHistory';
import DeveloperDocs from './components/DeveloperDocs';
import WalletButton from './components/WalletButton';

type Tab = 'swap' | 'history' | 'developers';

export default function App() {
    const [tab, setTab] = useState<Tab>('swap');

    return (
        <div className="app-root">

            {/* ── Navbar ─────────────────────────────────────────────────── */}
            <nav className="navbar">
                {/* Brand */}
                <div className="navbar-brand">
                    <div className="logo-icon">
                        <Waves color="#fff" size={18} />
                    </div>
                    FaroLink
                </div>

                {/* Tabs */}
                <div className="navbar-center">
                    {(['swap', 'history', 'developers'] as Tab[]).map(t => (
                        <button
                            key={t}
                            id={`nav-tab-${t}`}
                            className={`nav-tab ${tab === t ? 'active' : ''}`}
                            onClick={() => setTab(t)}
                        >
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Wallet & Grant Link — Fix B1 */}
                <div className="navbar-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <a
                        href="/whitepaper"
                        target="_blank"
                        style={{ color: 'var(--accent)', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <FileText size={14} />
                        Whitepaper
                    </a>
                    <a
                        href="https://github.com/santionetwork/farolink"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--accent)', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <Code2 size={14} />
                        GitHub
                    </a>
                    <WalletButton />
                </div>
            </nav>

            {/* ── Main Content ─────────────────────────────────────────────── */}
            <main className="main-content">
                {tab === 'swap' && (
                    <>
                        <SwapWidget />
                        <TransactionHistory />
                    </>
                )}
                {tab === 'history' && (
                    <div style={{ width: '100%', maxWidth: 480 }}>
                        <div style={{ marginBottom: 24 }}>
                            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)' }}>
                                Transaction History
                            </h1>
                            <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginTop: 4 }}>
                                All your cross-chain swaps, stored locally.
                            </p>
                        </div>
                        <TransactionHistory />
                    </div>
                )}
                {tab === 'developers' && <DeveloperDocs />}
            </main>

            {/* ── Footer — Fix U1/U7 ─────────────────────────────────────── */}
            <footer className="app-footer">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-4)', fontSize: '0.8rem' }}>
                    <Waves size={14} />
                    <span>© 2026 FaroLink · Testnet</span>
                    <span style={{
                        padding: '2px 6px',
                        fontSize: '0.65rem',
                        background: 'rgba(245,158,11,0.1)',
                        color: 'var(--warning)',
                        border: '1px solid rgba(245,158,11,0.2)',
                        borderRadius: 4,
                        fontWeight: 600,
                    }}>
                        BETA
                    </span>
                </div>

                <div className="footer-links">
                    <a href="https://github.com/farolink" target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Code2 size={13} /> GitHub
                    </a>
                    <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api-docs`} target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <FileText size={13} /> API Docs
                    </a>
                    <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Shield size={13} /> Audit
                    </a>
                </div>
            </footer>
        </div>
    );
}
