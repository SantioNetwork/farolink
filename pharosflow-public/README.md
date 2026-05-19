# Pharosflow 🌊

**Pharosflow** is the premier modular cross-chain liquidity and intent aggregator built specifically for the **Pharos Network** ecosystem. 

Like 1inch or Li.Fi, Pharosflow aggregates liquidity routes. However, Pharosflow goes much further by combining **DEX Aggregation** with **Bridge Aggregation**, seamlessly leveraging Account Abstraction to offer zero-gas intent-based cross-chain swaps.

## 🚀 Features

- **True Cross-Chain Routing:** Finds the absolute most efficient route spanning multiple decentralized exchanges *and* multiple bridges simultaneously.
- **Intent-Based Execution (ERC-4337):** Users don't pay gas for bridging. By signing an intent, the Pharosflow Execution Engine bundles operations, handles all approvals, and securely executes the trades seamlessly.
- **Zero-TVL Security Bias:** Pharosflow's routing algorithm assigns artificial weight penalties to bloated "Lock-and-Mint" bridges, actively prioritizing highly-secure 0-TVL venues (like deBridge) to drastically mitigate user counter-party risk.
- **Real-World Asset (RWA) Native:** Deep integration with the Pharos Compliance API. If an asset is flagged as highly-regulated (like a tokenized T-Bill), Pharosflow's `ComplianceGate` explicitly restricts traversal strictly to authorized enterprise bridges like CCIP and CCTP.
- **SPN Accelerated:** Designed to run its computationally intensive Dijkstra Pathfinding algorithm directly on Pharos's specialized High-Frequency Trading (HFT) subnets for sub-second quote formulation.

---

## 🏗️ The 4-Layer Architecture

Pharosflow isolates heavy lifting via a modern Microservice Architecture to ensure massive horizontal scaling capabilites:

1. **[`/pharosflow-indexer`](./pharosflow-indexer/) (Layer 1)**: Syncs real-time liquidity states and network events straight from Goldsky Websockets. Features bulk-batching postgres ingestion and multi-node Redis caching.
2. **[`/pharosflow-router`](./pharosflow-router/) (Layer 2)**: The brain. A computationally heavy RPC module running the Dijkstra Algorithm across 10,000s of connected Redis pool edges to score paths based on gas, price-impact, and MEV susceptibility.
3. **[`/pharosflow-executor`](./pharosflow-executor/) (Layer 3)**: The muscle. Simulates bridging packages entirely off-chain using native `ethers.provider.call` intercepts. If the simulation passes, the bundler seamlessly proxies intents into LayerZero, native bridges, Axelar, or Wormhole.
4. **[`/pharosflow-api`](./pharosflow-api/) (Layer 4)**: The Gateway. A rate-limited, Zod-validated, OpenAPI-compliant Express gateway allowing DApps to integrate Pharosflow seamlessly.

---

## 💻 Quickstart

### Prerequisites:
- `Node.js` v20+
- A running instance of `Redis` Server (Port 6379)
- A local or remote `PostgreSQL` instance (Port 5432)

### Starting the Cluster:

You must run all microservices concurrently for the system to process intents securely.

1. **Start the Indexer:**
   ```bash
   cd pharosflow-indexer
   npm i
   # Configure your .env
   npm start
   ```

2. **Start the Router:**
   ```bash
   cd pharosflow-router
   npm i
   npm start
   ```

3. **Start the Executor:**
   ```bash
   cd pharosflow-executor
   npm i
   npm start
   ```

4. **Start the Developer Gateway:**
   ```bash
   cd pharosflow-api
   npm i
   npm start
   ```

*(For local testing, the Gateway API is exposed at `http://localhost:4000`)*

## 📚 API Documentation
Once the API gateway is running, interactive Swagger/OpenAPI documentation is available at:
👉 **[http://localhost:4000/api-docs](http://localhost:4000/api-docs)** 

---

## 🛡️ Supported Venues (Bridge Adapters)
Pharosflow supports plug-and-play bridging architectures. Current default adapters include:
- **Pharos Native Mailbox**
- **LayerZero (v2)**
- **Chainlink CCIP**
- **Circle CCTP**
- **deBridge** (Highly preferred due to 0-TVL routing bias)
- **Axelar**
- **Wormhole**
