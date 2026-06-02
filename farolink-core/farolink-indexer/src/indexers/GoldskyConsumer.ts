/**
 * GoldskyConsumer — Goldsky Mirror Integration
 *
 * Architecture: Goldsky Mirror (NOT WebSocket)
 * ─────────────────────────────────────────────────────────────────────────────
 * Goldsky Mirror is a PUSH-based data pipeline service. You do NOT connect to
 * Goldsky's servers at runtime. Instead:
 *
 *   1. You deploy YAML pipeline definitions using the Goldsky CLI:
 *      `goldsky pipeline apply --path goldsky/liquidity.pipeline.yaml`
 *
 *   2. Goldsky connects TO your Postgres database and fills your tables
 *      (goldsky_liquidity, goldsky_spn, goldsky_kyc) in real time.
 *
 *   3. THIS service polls those tables using a high-watermark cursor and
 *      publishes Redis events so the Router gets live liquidity updates.
 *
 * Setup:
 *   npm install -g @goldskycom/cli
 *   goldsky login                                         # paste your API key
 *   goldsky secret create FAROLINK_PG --value "postgres://..."
 *   goldsky pipeline apply --path goldsky/liquidity.pipeline.yaml
 *   goldsky pipeline apply --path goldsky/spn.pipeline.yaml
 *   goldsky pipeline apply --path goldsky/kyc.pipeline.yaml
 */

import { pgPool }              from '../store/PostgresClient';
import { redisCache, redisPub } from '../store/RedisClient';
import { env }                 from '../config/env';
import winston                 from 'winston';

const logger = winston.createLogger({
    level:      env.LOG_LEVEL,
    format:     winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
});

// ── Watermark keys stored in Redis so we survive restarts ──────────────────
const WM_LIQUIDITY = 'indexer:watermark:liquidity';
const WM_SPN       = 'indexer:watermark:spn';
const WM_KYC       = 'indexer:watermark:kyc';

export class GoldskyConsumer {
    private pollInterval: NodeJS.Timeout | null = null;

    async start(): Promise<void> {
        logger.info('GoldskyConsumer starting — polling Postgres tables populated by Goldsky Mirror pipelines');
        await this.poll();  // immediate first poll
        this.pollInterval = setInterval(() => this.poll(), env.POLL_INTERVAL_MS);
    }

    public async stop(): Promise<void> {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        logger.info('GoldskyConsumer stopped');
    }

    // ── Main poll cycle ────────────────────────────────────────────────────
    private async poll(): Promise<void> {
        await Promise.allSettled([
            this.pollLiquidity(),
            this.pollSpn(),
            this.pollKyc(),
        ]);
    }

    // ── Liquidity ──────────────────────────────────────────────────────────
    private async pollLiquidity(): Promise<void> {
        const wm  = await this.getWatermarkStr(WM_LIQUIDITY);

        // Query both goldsky_liquidity (Goldsky Mirror) and liquidity_pools (canonical schema).
        // The `reserves` JSONB column holds {"0":"<reserve0>","1":"<reserve1>"} or [r0, r1].
        // Also query the canonical `liquidity_pools` table which has explicit reserve0/reserve1 NUMERIC columns.
        const goldskyRes = await pgPool.query<{
            id: string;
            chain_id: number;
            pair_address: string;
            token0: string | null;
            token1: string | null;
            volume_24h: string;
            reserves: any;          // JSONB — could be null, object, or array
        }>(
            `SELECT id, chain_id, pair_address, token0, token1, volume_24h, reserves
               FROM goldsky_liquidity
              WHERE ($1 = '' OR id > $1)
              ORDER BY id ASC
              LIMIT 500`,
            [wm]
        );

        // Also poll the canonical liquidity_pools table (written by direct indexers or admin tooling)
        const canonicalRes = await pgPool.query<{
            chain_id: number;
            pair_address: string;
            token0: string;
            token1: string;
            reserve0: string;
            reserve1: string;
            volume_24h: string;
        }>(
            `SELECT chain_id, pair_address, token0, token1, reserve0, reserve1, volume_24h
               FROM liquidity_pools
              WHERE reserve0 > 0 AND reserve1 > 0`
        ).catch(() => ({ rows: [] as any[] }));  // Table may not exist yet

        // Write canonical pools to Redis (these have reliable reserve data)
        for (const row of canonicalRes.rows) {
            await redisCache.setex(
                `liquidity:${row.chain_id}:${row.pair_address}`,
                600,
                JSON.stringify({
                    token0:    row.token0.toLowerCase(),
                    token1:    row.token1.toLowerCase(),
                    reserves:  [row.reserve0.toString(), row.reserve1.toString()],
                    volume24h: row.volume_24h,
                })
            );
        }
        if (canonicalRes.rows.length > 0) {
            logger.info(`Liquidity (canonical): published ${canonicalRes.rows.length} pools to Redis`);
        }

        if (goldskyRes.rows.length === 0) return;

        let publishedCount = 0;
        for (const row of goldskyRes.rows) {
            // Extract reserves from the JSONB column
            const reserves = this.extractReserves(row.reserves);

            // Skip pools with no token addresses — can't build graph edges without them
            if (!row.token0 || !row.token1) {
                logger.debug(`Liquidity: skipping pool ${row.pair_address} — missing token addresses`);
                continue;
            }

            await redisCache.setex(
                `liquidity:${row.chain_id}:${row.pair_address}`,
                600,    // 10 min TTL — survives multiple poll intervals
                JSON.stringify({
                    token0:    row.token0.toLowerCase(),
                    token1:    row.token1.toLowerCase(),
                    reserves,
                    volume24h: row.volume_24h,
                })
            );
            await redisPub.publish('liquidity:updated', JSON.stringify({
                chainId:     row.chain_id,
                pairAddress: row.pair_address,
            }));
            publishedCount++;
        }

        // id column is text (log_0x..._N) — use string watermark
        const maxId = goldskyRes.rows[goldskyRes.rows.length - 1]!.id;
        await this.setWatermarkStr(WM_LIQUIDITY, maxId);
        logger.info(`Liquidity: processed ${goldskyRes.rows.length} rows (${publishedCount} published), watermark → ${maxId}`);
    }

    /**
     * Extracts reserve0/reserve1 from the JSONB `reserves` column.
     * Handles multiple formats:
     *   - Array: [reserve0, reserve1]
     *   - Object with numeric keys: {"0": "...", "1": "..."}
     *   - Object with named keys: {"reserve0": "...", "reserve1": "..."}
     *   - null/undefined: returns ["0","0"]
     */
    private extractReserves(reservesData: any): [string, string] {
        if (!reservesData) return ['0', '0'];
        try {
            const data = typeof reservesData === 'string' ? JSON.parse(reservesData) : reservesData;
            if (Array.isArray(data)) {
                return [(data[0] ?? '0').toString(), (data[1] ?? '0').toString()];
            }
            if (typeof data === 'object') {
                const r0 = data['0'] ?? data.reserve0 ?? data.r0 ?? '0';
                const r1 = data['1'] ?? data.reserve1 ?? data.r1 ?? '0';
                return [r0.toString(), r1.toString()];
            }
        } catch {
            logger.warn('Failed to parse reserves JSONB', { raw: reservesData });
        }
        return ['0', '0'];
    }

    // ── SPN Cross-chain Messages ───────────────────────────────────────────
    private async pollSpn(): Promise<void> {
        const wm  = await this.getWatermark(WM_SPN);
        const res = await pgPool.query<{
            id: number;
            message_id: string;
            sender: string;
            dest_chain_id: number;
            status: string;
            latency_ms: number;
        }>(
            `SELECT id, message_id, sender, dest_chain_id, status, latency_ms
               FROM goldsky_spn
              WHERE id > $1
              ORDER BY id ASC
              LIMIT 500`,
            [wm]
        );

        if (res.rows.length === 0) return;

        for (const row of res.rows) {
            await redisCache.setex(
                `spn:msg:${row.message_id}`,
                86400,
                JSON.stringify({ sentAt: Date.now(), status: row.status, latencyMs: row.latency_ms })
            );
            await redisPub.publish('spn:delivered', JSON.stringify({
                messageId: row.message_id,
                status:    row.status,
            }));
        }

        const maxId = res.rows[res.rows.length - 1]!.id;
        await this.setWatermark(WM_SPN, maxId);
        logger.debug(`SPN: processed ${res.rows.length} rows, watermark → ${maxId}`);
    }

    // ── KYC / Compliance ──────────────────────────────────────────────────
    private async pollKyc(): Promise<void> {
        const wm  = await this.getWatermark(WM_KYC);
        const res = await pgPool.query<{
            id: number;
            address: string;
            chain_id: number;
            is_kyced: boolean;
            aml_risk: string;
            jurisdictions: object;
        }>(
            `SELECT id, address, chain_id, is_kyced, aml_risk, jurisdictions
               FROM goldsky_kyc
              WHERE id > $1
              ORDER BY id ASC
              LIMIT 500`,
            [wm]
        );

        if (res.rows.length === 0) return;

        for (const row of res.rows) {
            await redisCache.setex(
                `compliance:${row.address}:${row.chain_id}`,
                300,
                JSON.stringify(row)
            );
            await redisPub.publish('compliance:updated', JSON.stringify({
                address: row.address,
                chainId: row.chain_id,
            }));
        }

        const maxId = res.rows[res.rows.length - 1]!.id;
        await this.setWatermark(WM_KYC, maxId);
        logger.debug(`KYC: processed ${res.rows.length} rows, watermark → ${maxId}`);
    }

    // ── Watermark helpers (persisted in Redis, survive restarts) ───────────
    // NOTE: goldsky_liquidity.id is TEXT (log_0x..._N), not an integer.
    //       We store the raw string and use it in SQL as-is (Postgres text comparison).
    private async getWatermarkStr(key: string): Promise<string> {
        const val = await redisCache.get(key);
        return val ?? '';  // empty string = fetch from the beginning
    }

    private async getWatermark(key: string): Promise<number> {
        const val = await redisCache.get(key);
        return val ? parseInt(val, 10) : 0;
    }

    private async setWatermark(key: string, id: number): Promise<void> {
        // No TTL — watermarks must persist across restarts
        await redisCache.set(key, String(id));
    }

    private async setWatermarkStr(key: string, id: string): Promise<void> {
        await redisCache.set(key, id);
    }
}
