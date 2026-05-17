# PharosFlow 🌊
### Cross-Chain Liquidity Infrastructure for the Pharos RealFi Ecosystem

> **Built by [Stephen Benti](https://github.com/stephenbenti) — Pharos Incubator Applicant, May 2026**  
> Solo founder. Full-stack blockchain engineer.

---

## What is PharosFlow?

PharosFlow is the **routing and execution layer** the Pharos ecosystem needs to make Real-World Assets (RWAs) liquid. It is an intent-based, MEV-resistant cross-chain swap aggregator — think 1inch + Li.Fi, purpose-built for Pharos's RealFi vision.

When a user wants to move USDM from Ethereum to Pharos, or swap S-UST for WPHRS on Pharos Atlantic, there is currently **no routing infrastructure** to do that efficiently. PharosFlow is that infrastructure.

---

## Live Demo

| Interface | URL |
|-----------|-----|
| 🖥️ Swap UI | **[pharosflow.vercel.app](https://pharosflow.vercel.app)** *(deploying — link updated post-submission)* |
| 📖 API Docs | `http://localhost:4000/api-docs` (local) |
| 🔗 Pharos Atlantic Testnet | [atlantic.pharosscan.xyz](https://atlantic.pharosscan.xyz) |

---

## Why Pharos Needs This

Pharos has deployed **22+ RWA tokens** (USDM, USDY, S-UST, AQ-TPC, P-stNova, etc.) on Atlantic testnet. These tokens have **no routing layer** — without PharosFlow, they are isolated liquidity islands with no way to efficiently trade or bridge them cross-chain.

PharosFlow solves this by:
1. **Indexing every live DEX pool** on Pharos via Goldsky in real-time
2. **Running Bellman-Ford pathfinding** across 109+ pool pairs on 7 chains
3. **Executing via EIP-712 signed intents** — users never touch gas
4. **Enforcing RWA compliance** — regulated tokens (T-Bills, etc.) are locked to CCIP-only routes

---

## Architecture — 4 Layers

```
User Wallet
    │ EIP-712 intent signature
    ▼
┌─────────────────────────────────────────────────────┐
│  Layer 4 — pharosflow-api  (:4000)                  │
│  Rate-limited REST gateway · Swagger docs · Zod      │
└──────────────────────┬──────────────────────────────┘
                       │ /route
┌──────────────────────▼──────────────────────────────┐
│  Layer 2 — pharosflow-router  (:3000)               │
│  Bellman-Ford pathfinder · x*y=k AMM math           │
│  109 pool pairs across 7 chains in Upstash Redis    │
└──────────────────────┬──────────────────────────────┘
                       │ reserves feed
┌──────────────────────▼──────────────────────────────┐
│  Layer 1 — pharosflow-indexer  (:3001)              │
│  Goldsky → Neon DB → Redis pipeline                 │
│  28,810+ processed Pharos Atlantic log rows         │
└─────────────────────────────────────────────────────┘
                       │ execute
┌─────────────────────────────────────────────────────┐
│  Layer 3 — pharosflow-executor  (:5000)             │
│  ERC-4337 UserOp bundler · Bridge adapters          │
│  [Testnet Note: executor targets local Hardhat RPC  │
│   pending bytecode size fix on Pharos Atlantic]     │
└─────────────────────────────────────────────────────┘
```

---

## Current Testnet Status (Pharos Atlantic — May 2026)

| Component | Status | Notes |
|-----------|--------|-------|
| Goldsky indexer | ✅ Live | 28,810 rows processed |
| Redis liquidity graph | ✅ Live | 109 pool pairs, 7 chains |
| Pharos DEX pools | ✅ Real on-chain | 67 pools discovered via RPC |
| Other chain pools | ⚠️ Simulated | Market-rate reserves (ETH=$3200 etc.) |
| Router pathfinding | ✅ Live | 15/15 quote pairs passing |
| Executor on-chain | 🔄 Hardhat | Pending Pharos Atlantic bytecode size fix |
| Frontend UI | ✅ Live | Vercel deploy |
| SDK | ✅ Published | `npm i @pharosflow/sdk` |

---

## Supported Chains

| Chain | DEX Pools | Real Data? |
|-------|-----------|-----------|
| **Pharos Atlantic (688689)** | 67 | ✅ Real on-chain |
| Ethereum (1) | 9 | Demo reserves |
| Arbitrum (42161) | 7 | Demo reserves |
| Base (8453) | 7 | Demo reserves |
| Polygon (137) | 7 | Demo reserves |
| Optimism (10) | 6 | Demo reserves |
| BSC (56) | 6 | Demo reserves |

---

## Supported Pharos Tokens (22 tokens)

| Symbol | Type | Pools |
|--------|------|-------|
| WPHRS | Native wrapped | 5+ |
| WETH, USDC, USDT, WBTC | Major | 4+ each |
| SAFI | Ecosystem | 1 |
| USDM, USDY | RWA Stablecoins | 2 each |
| S-UST, AQ-UST, C-UST, P-UST | RWA Structured | 1 each |
| S-TPC, AQ-TPC, C-TPC, P-TPC | RWA Structured | 1 each |
| S-stNova, AQ-stNova, P-stNova | RWA Structured | 1 each |
| SS-UST-30JUN2026, SS-TPC-31DEC2026, SS-STNOVA-31DEC2026 | Term RWA | 1 each |

---

## Supported Bridges

| Bridge | Fee | Use Case |
|--------|-----|----------|
| Pharos Native Mailbox | 0.01% | Pharos ↔ EVM (fastest) |
| deBridge DLN | 0.03% | General (0-TVL preferred) |
| LayerZero v2 | 0.05% | General |
| Circle CCTP | 0% | USDC native transfers |
| Chainlink CCIP | 0.08% | **RWA-only compliance route** |
| Axelar | 0.06% | General |
| Wormhole | 0.08% | General |

---

## SDK Quick Start

```typescript
import { PharosflowClient } from '@pharosflow/sdk';

const client = new PharosflowClient({
  apiUrl: 'https://api.pharosflow.net',
  apiKey: 'pk_live_...',
});

// Get optimal route across 7 chains
const quote = await client.getQuote({
  fromChain: 1,         // Ethereum
  toChain:   688689,    // Pharos
  fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  toToken:   '0xe0be08c77f415f577a1b3a9ad7a1df1479564ec8', // USDC on Pharos
  amountIn:  '1000000000', // 1000 USDC
  userAddress: '0xYourAddress',
});

// Sign intent — no gas required
const signed = await client.signIntent(quote.intentPayload!, ethersSigner);

// Execute — executor handles everything
const { trackingHash } = await client.executeIntent(signed);

// Track delivery
const final = await client.trackIntent(trackingHash);
console.log(final.status); // → 'DELIVERED'
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/quote` | POST | Get optimal cross-chain route |
| `/v1/execute` | POST | Submit signed intent |
| `/v1/status/:hash` | GET | Track delivery status |
| `/v1/admin/generate-key` | POST | Issue API key |
| `/api-docs` | GET | Swagger UI |
| `/metrics` | GET | Prometheus metrics |

---

## Local Development

### Prerequisites
- Node.js v20+
- Upstash Redis account (free tier)
- Neon PostgreSQL (free tier)

### Run all services
```bash
# 1. Indexer (Goldsky → Redis)
cd pharosflow-core/pharosflow-indexer && npm i && npm start

# 2. Router (pathfinding engine)
cd pharosflow-core/pharosflow-router && npm i && npm start

# 3. Executor (intent execution)
cd pharosflow-public/pharosflow-executor && npm i && npm start

# 4. API Gateway
cd pharosflow-core/pharosflow-api && npm i && npm start

# 5. Frontend
cd pharosflow-public/pharosflow-web && npm i && npm run dev
```

---

## Pharos Incubator — Proposed Milestones

| Milestone | Timeline | Deliverable |
|-----------|----------|-------------|
| **M1** | Month 1 | Executor deployed on Pharos mainnet — first real on-chain swap executed |
| **M2** | Month 2 | Live DEX pool discovery for ETH/ARB/Base via Uniswap factory RPCs |
| **M3** | Month 3 | SDK published to npm, 3 third-party DApp integrations |
| **M4** | Month 4 | $1M cumulative volume routed through PharosFlow |

---

## About the Builder

**Stephen Benti** — Solo founder & full-stack blockchain engineer.

PharosFlow is a solo project demonstrating that a single focused builder can design and ship production-grade blockchain infrastructure. Every line of code — from the Goldsky indexer pipeline to the EIP-712 signing SDK to the Bellman-Ford pathfinder — was written by Stephen.

> *"Pharos has deployed the RWA tokens. PharosFlow is the routing layer that makes them move."*

---

## Innovation Path Alignment

**Pharos Incubator Track: RWA/Payments + Innovative Infrastructure**

PharosFlow directly enables the Pharos "RealFi at global scale" thesis by solving the **liquidity routing problem** for RWA tokens on Pharos. Without a routing layer, issuers deploy tokens that users cannot efficiently trade or bridge. PharosFlow is the missing infrastructure piece.

---

*Built on Pharos Atlantic Testnet · Powered by Goldsky · Secured by EIP-712*
