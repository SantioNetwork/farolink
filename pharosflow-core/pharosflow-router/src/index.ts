import express from 'express';
import cors from 'cors';
import winston from 'winston';
import { env } from './config/env';
import { LiquidityGraph } from './graph/LiquidityGraph';
import { PathFinder } from './engine/PathFinder';
import { RouteScorer } from './engine/RouteScorer';
import { MEVShield } from './engine/MEVShield';
import type { RouteRequest, RouteResponse } from './types/route';

const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

const app = express();
app.use(cors());
app.use(express.json());

/** Serialize bigints as strings so JSON.stringify doesn't throw. */
function jsonBigInt(obj: unknown): string {
    return JSON.stringify(obj, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    );
}

function sendJson(res: express.Response, statusCode: number, obj: unknown): void {
    res.status(statusCode).set('Content-Type', 'application/json').send(jsonBigInt(obj));
}

const graph = new LiquidityGraph();
const pathFinder = new PathFinder(graph);
const routeScorer = new RouteScorer();
const mevShield = new MEVShield(env.PRIVATE_RPC_URL ?? '');

// Realtime Graph sync loop
setInterval(() => {
    graph.refreshGraph().catch(e => logger.error('Graph refresh failed', e));
}, 10000);

app.post('/route', async (req, res) => {
    try {
        // Normalize field names: accept both fromChainId and fromChain
        const b = req.body;
        const body: RouteRequest = {
            ...b,
            fromChain: b.fromChain ?? b.fromChainId,
            toChain:   b.toChain   ?? b.toChainId,
            // Lowercase addresses so they match Redis keys written by the seeder
            fromToken: (b.fromToken ?? '').toLowerCase(),
            toToken:   (b.toToken   ?? '').toLowerCase(),
            amountIn:  BigInt(b.amountIn ?? '0'),
        };
        const route = await pathFinder.findBestRoute(body);
        
        if (!route) {
            sendJson(res, 400, { error: "No liquidity path found between these tokens" });
            return;
        }

        // Enrich response with route quality score and MEV protection assessment
        const routeForScoring = {
            hops: route.hops,
            estimatedTotalOutput: BigInt(route.expectedOutput),
            totalGas: BigInt(route.totalGasEstimated),
            totalLatencyMs: route.hops.reduce((acc: number, h: any) => acc + (h.latencyMs ?? 0), 0),
            overallRiskScore: route.priceImpactBps > 200 ? 7 : route.priceImpactBps > 50 ? 4 : 1,
        };
        const routeScore = routeScorer.scoreRoute(routeForScoring);
        const mevRisk = mevShield.assessRisk(route.priceImpactBps, body.amountIn);

        sendJson(res, 200, {
            ...route,
            routeScore: Math.round(routeScore * 100) / 100,
            mevProtection: {
                riskLevel: mevRisk.severity,
                isAtRisk: mevRisk.isAtRisk,
                reason: mevRisk.reason,
                usePrivateRpc: mevRisk.isAtRisk && (env.PRIVATE_RPC_URL ?? '').length > 0,
            },
        });
    } catch (err: any) {
        logger.error('Routing error', { message: err.message });
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', nodes: graph.getGraphSnapshot().nodes });
});

async function main() {
    await graph.refreshGraph();
    const server = app.listen(env.PORT, () => {
        logger.info(`Pharosflow Router listening on port ${env.PORT}`);
    });

    // Graceful Shutdown
    const shutdown = async () => {
        logger.info('Shutdown signal received.');
        server.close();
        graph.disconnect();
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

if (require.main === module) {
    main().catch(e => logger.error('Startup crash', e));
}
