import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import { env } from './config/env';
import { bridgeRegistry } from './bridges/BridgeRegistry';
import { BridgeAbstractor } from './executor/BridgeAbstractor';
import { Hop } from './bridges/BridgeAdapter';
import { BridgingIntent } from './executor/IntentStructs';

const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

export const app = express();

// Executor is an internal service — no public CORS needed.
// Only accept requests from services on the same Docker network.
app.use(cors({ origin: false }));
app.use(express.json({ limit: '32kb' }));

// Fix H-3: Rate limit — even internal callers should not flood the executor.
// 10 req/min is generous for a single-instance executor.
app.use(rateLimit({
    windowMs: 60_000,
    max: 10,
    message: { error: 'Executor rate limit exceeded (10 req/min).' },
    standardHeaders: true,
    legacyHeaders: false,
}));

// Fix C-1: Internal secret middleware — every call must present the shared secret.
// Configured via INTERNAL_SECRET env var (min 32 chars, generated with openssl rand -hex 32).
const requireInternalSecret = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const secret = req.headers['x-internal-secret'];
    if (!secret || secret !== env.INTERNAL_SECRET) {
        logger.warn('Rejected request missing/invalid internal secret', {
            ip: req.ip,
            path: req.path,
        });
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
};

// Health is exempt — used by Docker healthcheck from within the same host.
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', executorMode: 'active' });
});

// All execution endpoints require the internal secret.
app.use(requireInternalSecret);

const abstractor = new BridgeAbstractor(bridgeRegistry);

app.post('/execute', async (req, res) => {
    try {
        const hop: Hop = req.body.hop;
        if (!hop) {
            res.status(400).json({ error: "Missing 'hop' payload in request" });
            return;
        }
        const result = await abstractor.execute(hop);
        res.json(result);
    } catch (err: any) {
        // Fix L-8: Full error details are logged internally; callers get a generic message.
        logger.error('Execution Failed', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Execution failed. Use the status API to check progress.' });
    }
});

app.post('/execute-intent', async (req, res) => {
    try {
        const intent: BridgingIntent = req.body.intent;
        if (!intent) {
            res.status(400).json({ error: "Missing 'intent' payload in request" });
            return;
        }
        const result = await abstractor.executeIntentBundle(intent);
        res.json(result);
    } catch (err: any) {
        // Fix L-8: Sanitize — do not leak wallet/contract details to callers.
        logger.error('Intent Execution Failed', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Intent execution failed. Use the status API to check progress.' });
    }
});

let _server: ReturnType<typeof app.listen> | null = null;

async function main() {
    _server = app.listen(env.PORT, () => {
        logger.info(`FaroLink Execution Cluster listening on port ${env.PORT}`);
    });

    // Explicitly keep the event loop alive
    _server.ref();

    process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled rejection', { reason: String(reason) });
    });

    const shutdown = async () => {
        logger.info('Shutdown signal received.');
        _server?.close();
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

// Always call main() — ts-node doesn't reliably satisfy require.main === module
main().catch(e => logger.error('Startup crash', e));

