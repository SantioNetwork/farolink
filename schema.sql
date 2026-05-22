-- =============================================================================
-- FaroLink Unified Database Schema
-- Fix #17 / #30: Single authoritative schema replacing the two parallel systems.
--
-- TABLES:
--   liquidity_pools — written by Indexer, read by Router for DEX edge weights
--   spn_messages    — SPN cross-chain message tracking (was goldsky_spn)
--   kyc_flags       — KYC/AML per address (was goldsky_kyc), read by Compliance API
--   bridge_events   — Per-execution audit trail, written by Executor
--   api_keys        — B2B SaaS auth keys, managed by API Gateway
--   webhooks        — Webhook delivery subscriptions (#37)
-- =============================================================================

-- ─── LIQUIDITY POOLS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liquidity_pools (
    id            SERIAL PRIMARY KEY,
    chain_id      INTEGER      NOT NULL,
    pair_address  VARCHAR(42)  NOT NULL,
    token0        VARCHAR(42)  NOT NULL,
    token1        VARCHAR(42)  NOT NULL,
    reserve0      NUMERIC      NOT NULL DEFAULT 0,
    reserve1      NUMERIC      NOT NULL DEFAULT 0,
    volume_24h    NUMERIC               DEFAULT 0,
    fee_bps       INTEGER               DEFAULT 30,
    venue         VARCHAR(50)  NOT NULL DEFAULT 'dex_pool',
    last_updated  TIMESTAMP             DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chain_id, pair_address)
);

-- ─── SPN MESSAGES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spn_messages (
    id            SERIAL PRIMARY KEY,
    message_id    VARCHAR(255) UNIQUE NOT NULL,
    sender        VARCHAR(255),
    dest_chain_id INTEGER,
    status        VARCHAR(50)         DEFAULT 'PENDING',
    latency_ms    INTEGER,
    payload       JSONB,
    created_at    TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP           DEFAULT CURRENT_TIMESTAMP
);

-- ─── KYC FLAGS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_flags (
    id               SERIAL PRIMARY KEY,
    address          VARCHAR(42)  NOT NULL,
    chain_id         INTEGER      NOT NULL,
    is_kyced         BOOLEAN              DEFAULT FALSE,
    aml_risk         NUMERIC              DEFAULT 0,
    is_rwa           BOOLEAN              DEFAULT FALSE,
    required_bridges TEXT[]               DEFAULT '{}',
    jurisdictions    JSONB                DEFAULT '[]',
    flag_reason      VARCHAR(255),
    created_at       TIMESTAMP            DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(address, chain_id)
);

-- ─── BRIDGE EVENTS ───────────────────────────────────────────────────────────
-- Written by the Executor when intents are submitted.
-- Updated by the delivery watcher when cross-chain confirmation arrives.
CREATE TABLE IF NOT EXISTS bridge_events (
    id                   SERIAL PRIMARY KEY,
    tracking_hash        VARCHAR(66) UNIQUE NOT NULL,
    intent_id            VARCHAR(36),
    source_chain_id      INTEGER     NOT NULL,
    destination_chain_id INTEGER     NOT NULL,
    source_user_address  VARCHAR(42),
    token_address        VARCHAR(42),
    amount               NUMERIC     NOT NULL,
    bridge_venue         VARCHAR(50) NOT NULL,
    status               VARCHAR(20)         DEFAULT 'PENDING',
    fee_collected        NUMERIC             DEFAULT 0,
    error_message        TEXT,
    created_at           TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP           DEFAULT CURRENT_TIMESTAMP
);

-- ─── API KEYS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
    id                    SERIAL PRIMARY KEY,
    organization_name     VARCHAR(100) NOT NULL,
    key_hash              VARCHAR(64)  UNIQUE NOT NULL,    -- SHA-256 of the raw key
    tier                  VARCHAR(20)          DEFAULT 'free',
    monthly_requests_used BIGINT               DEFAULT 0,
    monthly_reset_at      TIMESTAMP            DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month'),
    created_at            TIMESTAMP            DEFAULT CURRENT_TIMESTAMP,
    is_active             BOOLEAN              DEFAULT TRUE,
    CONSTRAINT valid_tier CHECK (tier IN ('free', 'builder', 'pro', 'enterprise'))
);

-- ─── WEBHOOKS ─────────────────────────────────────────────────────────────────
-- Fix #37: Webhook delivery subscriptions per API key.
CREATE TABLE IF NOT EXISTS webhooks (
    id          SERIAL PRIMARY KEY,
    api_key_id  INTEGER      REFERENCES api_keys(id) ON DELETE CASCADE,
    url         VARCHAR(500) NOT NULL,
    events      TEXT[]                DEFAULT ARRAY['delivery.confirmed','delivery.failed'],
    secret_hash VARCHAR(64)  NOT NULL,   -- HMAC-SHA256 key hash for signature verification
    is_active   BOOLEAN               DEFAULT TRUE,
    created_at  TIMESTAMP             DEFAULT CURRENT_TIMESTAMP
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_liq_chain_pair      ON liquidity_pools (chain_id, pair_address);
CREATE INDEX IF NOT EXISTS idx_liq_tokens          ON liquidity_pools (token0, token1);
CREATE INDEX IF NOT EXISTS idx_spn_message_status  ON spn_messages (message_id, status);
CREATE INDEX IF NOT EXISTS idx_kyc_address_chain   ON kyc_flags (address, chain_id);
CREATE INDEX IF NOT EXISTS idx_bridge_hash_status  ON bridge_events (tracking_hash, status);
CREATE INDEX IF NOT EXISTS idx_bridge_user         ON bridge_events (source_user_address, created_at);
CREATE INDEX IF NOT EXISTS idx_api_key_hash        ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_key_active      ON api_keys (is_active);
CREATE INDEX IF NOT EXISTS idx_webhooks_api_key    ON webhooks (api_key_id, is_active);
