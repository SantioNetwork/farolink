# FaroLink 🌊
### Cross-Chain Liquidity Infrastructure for the Pharos RealFi Ecosystem

> **Built by [Stephen Benti](https://github.com/stephenbenti) — Pharos Incubator Applicant, May 2026**  
> Solo founder. Full-stack blockchain engineer.

---

## What is FaroLink?

FaroLink is the **routing and execution layer** the Pharos ecosystem needs to make Real-World Assets (RWAs) liquid. It is an intent-based, MEV-resistant cross-chain swap aggregator — think 1inch + Li.Fi, purpose-built for Pharos's RealFi vision.

When a user wants to move USDM from Ethereum to Pharos, or swap S-UST for WPHRS on Pharos Atlantic, there is currently **no routing infrastructure** to do that efficiently. FaroLink is that infrastructure.

---

## Live Demo

| Interface | URL |
|-----------|-----|
| 🖥️ Swap UI | **[farolink.xyz](https://farolink.xyz)** |
| 📖 API Docs | `http://localhost:4000/api-docs` (local) |
| 🔗 Pharos Atlantic Testnet | [atlantic.pharosscan.xyz](https://atlantic.pharosscan.xyz) |

---

## Why Pharos Needs This

Pharos has deployed **22+ RWA tokens** (USDM, USDY, S-UST, AQ-TPC, P-stNova, etc.) on Atlantic testnet. These tokens have **no routing layer** — without FaroLink, they are isolated liquidity islands with no way to efficiently trade or bridge them cross-chain.

FaroLink solves this by:
1. **Indexing every live DEX pool** on Pharos via Goldsky in real-time
2. **Running Dijkstra pathfinding** across 109+ pool pairs on 7 chains
3. **Executing via EIP-712 signed intents** — users never touch gas
4. **Enforcing RWA compliance** — regulated tokens (T-Bills, etc.) are locked to CCIP-only routes

---

## Architecture — 4 Layers

```
User Wallet
    │ EIP-712 intent signature
    ▼
┌─────────────────────────────────────────────────────┐
│  Layer 4 — farolink-api  (:4000)                  │
│  Rate-limited REST gateway · Swagger docs · Zod      │
└──────────────────────┬──────────────────────────────┘
                       │ /route
┌──────────────────────▼──────────────────────────────┐
│  Layer 2 — farolink-router  (:3001)               │
│  Dijkstra pathfinder · x*y=k AMM math               │
│  109 pool pairs across 7 chains in Upstash Redis    │
└──────────────────────┬──────────────────────────────┘
                       │ reserves feed
┌──────────────────────▼──────────────────────────────┐
│  Layer 1 — farolink-indexer  (:3001)              │
│  Goldsky → Neon DB → Redis pipeline                 │
│  28,810+ processed Pharos Atlantic log rows         │
└─────────────────────────────────────────────────────┘
                       │ execute
┌─────────────────────────────────────────────────────┐
│  Layer 3 — farolink-executor  (:3002)             │
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
| SDK | ✅ Published | `npm i @farolink/sdk` |

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
import { FaroLinkClient } from '@farolink/sdk';

const client = new FaroLinkClient({
  apiUrl: 'https://api.farolink.xyz',
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
cd farolink-core/farolink-indexer && npm i && npm start

# 2. Router (pathfinding engine)
cd farolink-core/farolink-router && npm i && npm start

# 3. Executor (intent execution)
cd farolink-public/farolink-executor && npm i && npm start

# 4. API Gateway
cd farolink-core/farolink-api && npm i && npm start

# 5. Frontend
cd farolink-public/farolink-web && npm i && npm run dev
```

---

## Deployment

FaroLink is deployed as a split architecture: **Vercel** for the frontend, **Railway** for all backend services.

### Frontend → Vercel

```bash
# From the repository root on GitHub (santionetwork/farolink)
# Vercel auto-detects the Vite framework

# 1. Import project in Vercel dashboard
#    → Root Directory: farolink-public/farolink-web
#    → Framework: Vite

# 2. Set environment variable:
#    VITE_API_URL = https://farolink-api-production.up.railway.app
```

### Backend → Railway

Each service is deployed as a separate Railway service in a single project, all linked via private networking:

```bash
# In Railway dashboard, create a new project, then add 4 services:

# Service 1: API Gateway
#   → Root Directory: farolink-core/farolink-api
#   → Public networking: ON (this is the public endpoint)

# Service 2: Router Engine
#   → Root Directory: farolink-core/farolink-router
#   → Public networking: OFF (internal only)

# Service 3: Executor
#   → Root Directory: farolink-public/farolink-executor
#   → Public networking: OFF (internal only)

# Service 4: Indexer
#   → Root Directory: farolink-core/farolink-indexer
#   → Public networking: OFF (internal only)

# Add managed plugins: PostgreSQL + Redis
```

### Railway Environment Variables

| Variable | Service | Value |
|----------|---------|-------|
| `DATABASE_URL` | API, Indexer | `${{Postgres.DATABASE_URL}}` (Railway ref) |
| `REDIS_URL` | API, Router, Indexer | `${{Redis.REDIS_URL}}` (Railway ref) |
| `ROUTER_API_URL` | API | `http://farolink-router.railway.internal:3001` |
| `EXECUTOR_API_URL` | API | `http://farolink-executor.railway.internal:3002` |
| `INTERNAL_SECRET` | API, Executor | Shared 32+ char secret |
| `ADMIN_KEY_HASH` | API | SHA-256 of your master admin key |
| `EXECUTOR_PRIVATE_KEY` | Executor | Hot wallet private key |
| `RPC_URL` | Executor | `https://testnet.dplabs-internal.com` |
| `PORT` | API: `4000`, Router: `3001`, Executor: `3002`, Indexer: `3001` |
| `NODE_ENV` | All | `production` |
| `ALLOWED_ORIGINS` | API | `https://farolink.xyz,https://app.farolink.xyz` |

---

## Pharos Incubator — Proposed Milestones

| Milestone | Timeline | Deliverable |
|-----------|----------|-------------|
| **M1** | Month 1 | Executor deployed on Pharos mainnet — first real on-chain swap executed |
| **M2** | Month 2 | Live DEX pool discovery for ETH/ARB/Base via Uniswap factory RPCs |
| **M3** | Month 3 | SDK published to npm, 3 third-party DApp integrations |
| **M4** | Month 4 | $1M cumulative volume routed through FaroLink |

---

## About the Builder

**Stephen Benti** — Solo founder & full-stack blockchain engineer.

FaroLink is a solo project demonstrating that a single focused builder can design and ship production-grade blockchain infrastructure. Every line of code — from the Goldsky indexer pipeline to the EIP-712 signing SDK to the Dijkstra pathfinder — was written by Stephen.

> *"Pharos has deployed the RWA tokens. FaroLink is the routing layer that makes them move."*

---

## Innovation Path Alignment

**Pharos Incubator Track: RWA/Payments + Innovative Infrastructure**

FaroLink directly enables the Pharos "RealFi at global scale" thesis by solving the **liquidity routing problem** for RWA tokens on Pharos. Without a routing layer, issuers deploy tokens that users cannot efficiently trade or bridge. FaroLink is the missing infrastructure piece.

---

*Built on Pharos Atlantic Testnet · Powered by Goldsky · Secured by EIP-712*
