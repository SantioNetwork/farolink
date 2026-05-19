import React from 'react';
import { BookOpen, Terminal, CheckCircle2, Server, Key, Zap } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function DeveloperDocs() {
    return (
        <div className="docs-page">
            {/* Header */}
            <h1>Developer Hub</h1>
            <p className="subtitle">
                Integrate MEV-resistant, intent-based cross-chain liquidity directly into your DApp
                via the PharosFlow Layer 4 API Gateway.
            </p>

            {/* Quick Links */}
            <div className="docs-cards">
                <div className="docs-card">
                    <BookOpen color="var(--accent)" size={24} style={{ marginBottom: 12 }} />
                    <h3 style={{ color: 'var(--text-1)', marginBottom: 6 }}>Interactive API Portal</h3>
                    <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginBottom: 14 }}>
                        Test intents directly in the browser via Swagger UI.
                    </p>
                    {/* Fix B4: Use VITE_API_URL, not hardcoded localhost */}
                    <a href={`${API_BASE}/api-docs`} target="_blank" rel="noreferrer"
                        style={{ fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        Open Swagger UI →
                    </a>
                </div>

                <div className="docs-card">
                    <Terminal color="#a78bfa" size={24} style={{ marginBottom: 12 }} />
                    <h3 style={{ color: 'var(--text-1)', marginBottom: 6 }}>PharosFlow SDK</h3>
                    <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginBottom: 14 }}>
                        Install the native TypeScript SDK for full abstraction powers.
                    </p>
                    <code className="docs-code" style={{ padding: '6px 10px', display: 'block' }}>
                        npm i @pharosflow/sdk
                    </code>
                </div>
            </div>

            {/* Section 1: Architecture */}
            <div className="docs-section">
                <h2>
                    <Server size={18} color="var(--accent)" />
                    1. Architecture Overview
                </h2>
                <p style={{ color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 12 }}>
                    PharosFlow uses an <strong style={{ color: 'var(--text-1)' }}>intent-based execution model</strong>.
                    Your DApp never sends transactions directly — it requests a quote, signs an EIP-712 intent bundle,
                    and submits it. The PharosFlow executor cluster handles gas, routing, and cross-chain delivery.
                </p>
                <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>
                    The system is split across three internal layers:
                </p>
                <ul className="docs-list" style={{ marginTop: 12 }}>
                    <li>
                        <Zap size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
                        <span>
                            <strong>L2 Router</strong> — Dijkstra pathfinding across liquidity graphs. Returns the optimal multi-hop route and gas estimates.
                        </span>
                    </li>
                    <li>
                        <Zap size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
                        <span>
                            <strong>L3 Executor</strong> — ERC-4337 UserOp bundler. Validates signatures, sweeps protocol fees, submits to bridge adapters.
                        </span>
                    </li>
                    <li>
                        <Zap size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
                        <span>
                            <strong>L4 API Gateway</strong> — Public-facing REST API with API key auth, rate limiting, and signature verification.
                        </span>
                    </li>
                </ul>
            </div>

            {/* Section 2: Quick Start */}
            <div className="docs-section">
                <h2>2. Quick Start</h2>
                <pre className="docs-code">{`import axios from 'axios';
import { ethers } from 'ethers';

const API = '${API_BASE}';

// 1. Get the optimal cross-chain route
const { data: quote } = await axios.post(\`\${API}/v1/quote\`, {
  fromChain: 1,        // Ethereum
  toChain:   42161,    // Arbitrum
  fromToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  toToken:   '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC.e
  amountIn:  '1000000000000000000',                        // 1 WETH
}, { headers: { 'x-pharosflow-api-key': YOUR_API_KEY } });

// 2. Sign the returned intent via EIP-712
const signer    = new ethers.BrowserProvider(window.ethereum).getSigner();
const signature = await signer.signTypedData(
  quote.domain, quote.types, quote.intentPayload
);

// 3. Execute — executor handles gas + delivery
const { data } = await axios.post(\`\${API}/v1/execute\`, {
  intent: { ...quote.intentPayload, signature }
});

// 4. Poll for cross-chain status
const status = await axios.get(\`\${API}/v1/status/\${data.trackingHash}\`);
console.log(status.data.status); // PENDING → BROADCASTING → DELIVERED`}</pre>
            </div>

            {/* Section 3: API Guidelines */}
            <div className="docs-section">
                <h2>
                    <Key size={18} color="var(--accent)" />
                    3. API Guidelines &amp; Rate Limits
                </h2>
                <ul className="docs-list">
                    <li>
                        <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0 }} />
                        {/* Fix U4: Updated from 50 → 30 to match actual rate limiting */}
                        <span>
                            <strong>Rate Limits:</strong> Free tier — 30 req/min per IP.
                            Authenticated tiers: Builder 120, Pro 600, Enterprise unlimited.
                            Pass your key as <code className="docs-inline-code">x-pharosflow-api-key</code>.
                        </span>
                    </li>
                    <li>
                        <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0 }} />
                        <span>
                            <strong>Signature required:</strong> <code className="docs-inline-code">/v1/execute</code> verifies
                            EIP-712 signatures server-side. Intents without a valid signature from{' '}
                            <code className="docs-inline-code">sourceUserAddress</code> are rejected with 401.
                        </span>
                    </li>
                    <li>
                        <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0 }} />
                        <span>
                            <strong>Intent expiry:</strong> All intents have a max 2-hour deadline window.
                            Expired or duplicate intents are rejected with 400/409.
                        </span>
                    </li>
                    <li>
                        <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0 }} />
                        <span>
                            <strong>RWA Compliance:</strong> T-Bill and RWA tokens are automatically routed
                            exclusively through CCIP. This cannot be bypassed.
                        </span>
                    </li>
                    <li>
                        <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0 }} />
                        <span>
                            <strong>Gas Padding:</strong> All gas estimates include a 20% buffer.
                            The executor will not submit if the simulation reverts.
                        </span>
                    </li>
                </ul>
            </div>
        </div>
    );
}
