import express from 'express';
import cors from 'cors';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
import helmet from 'helmet';
import winston from 'winston';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import axios from 'axios';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ethers } from 'ethers';
import { z } from 'zod';
import cron from 'node-cron';
import { env } from './config/env';
import { Database } from './config/Database';
import {
    metricsRegistry,
    quoteRequestsTotal,
    executeRequestsTotal,
    routeLatencyHistogram,
} from './config/metrics';
import { WebhookDeliveryService } from './services/WebhookDeliveryService';

const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

export const app = express();

// ── Fix M2: HTTP security headers ────────────────────────────────────────────
app.use(helmet());

// ── Fix C2: CORS restricted to known origins ─────────────────────────────────
const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',').map(o => o.trim());
app.use(cors({
    origin: (origin, cb) => {
        // Allow server-to-server calls (no origin) and listed origins
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-pharosflow-api-key'],
}));

// ── Fix L1: Body size limit ───────────────────────────────────────────────────
app.use(express.json({ limit: '32kb' }));

const db    = new Database(env.DATABASE_URL, logger);
const redis = new Redis(env.REDIS_URL, { 
    family: 4,
    connectTimeout: 10000,
    tls: { rejectUnauthorized: false }
});

redis.on('error', (err) => logger.error('Redis connection error', { error: err.message }));

// Webhook delivery service for B2B push notifications
const webhookService = new WebhookDeliveryService(db.pool);

// Load Swagger Specs
const swaggerDocument = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'docs', 'swagger.json'), 'utf8')
);

// ── Fix L3: Swagger only available in non-production ─────────────────────────
if (env.NODE_ENV !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    logger.info('API Docs enabled (non-production)');
}

// ── Fix H2: Tier-aware rate limiters ─────────────────────────────────────────
const TIER_LIMITS: Record<string, number> = {
    free:       30,
    builder:    120,
    pro:        600,
    enterprise: 3000,
};

const freeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,  // Reduced from 50 — free tier is 30/min
    message:  { error: 'Rate limit exceeded. Provide an API key or upgrade your tier.' },
    standardHeaders: true,
    legacyHeaders:   false,
});

function makeTierLimiter(max: number) {
    return rateLimit({
        windowMs:   60 * 1000,
        max,
        message:    { error: `Rate limit exceeded for your tier (${max} req/min).` },
        standardHeaders: true,
        legacyHeaders:   false,
    });
}

// ── Fix C1: /metrics restricted to internal network ──────────────────────────
const internalOnly = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    const isPrivate = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip);
    if (!isLocal && !isPrivate) {
        return res.status(403).end();
    }
    next();
};

app.get('/metrics', internalOnly, async (_req, res) => {
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
});

// ── Auth Middleware ───────────────────────────────────────────────────────────
const requireApiKey = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const rawKey = req.headers['x-pharosflow-api-key'] as string;

    if (!rawKey) {
        return freeLimiter(req, res, next);
    }

    try {
        const hash     = crypto.createHash('sha256').update(rawKey).digest('hex');
        const userData = await db.trackAndValidateKey(hash);

        if (!userData) {
            // ── Fix L4: Log failed auth attempts for brute-force detection ──
            logger.warn('Failed API key attempt', { ip: req.ip, keyPrefix: rawKey.slice(0, 10) });
            return res.status(401).json({ error: 'Invalid or revoked API key' });
        }

        (req as any).user = userData;

        // Apply per-tier rate limiting on top of quota
        const tierMax = TIER_LIMITS[userData.tier] ?? 30;
        makeTierLimiter(tierMax)(req, res, next);
    } catch (err: any) {
        if (err.message.includes('Rate limit exceeded')) {
            return res.status(429).json({ error: err.message });
        }
        logger.error('API key verification failed', { error: err.message });
        // ── Fix M3: No internal error details in 5xx responses ──
        return res.status(500).json({ error: 'Authentication service error' });
    }
};

app.use('/v1/', requireApiKey);

// ── Input validation schemas (Fix H1) ─────────────────────────────────────────
const EVM_ADDRESS = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM address');
const TX_HASH     = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash');

const QuoteSchema = z.object({
    fromChain:            z.number().int().positive(),
    toChain:              z.number().int().positive(),
    fromToken:            EVM_ADDRESS,
    toToken:              EVM_ADDRESS,
    amountIn:             z.string().regex(/^\d+$/, 'amountIn must be a decimal string (wei)'),
    slippageToleranceBps: z.number().int().min(0).max(1000).optional().default(50),
    userAddress:          EVM_ADDRESS.optional(),
});

const IntentSchema = z.object({
    sourceUserAddress:      EVM_ADDRESS,
    destinationUserAddress: EVM_ADDRESS.optional(), // Fix H-2: optional — defaults to sourceUserAddress
    sourceToken:            EVM_ADDRESS,
    destinationToken:       EVM_ADDRESS,
    amountIn:               z.string().regex(/^\d+$/),
    minAmountOut:           z.string().regex(/^\d+$/),
    sourceChainId:          z.number().int().positive(),   // Fix M-6: chain where user signed
    targetChainId:          z.number().int().positive(),
    deadline:               z.number().int().positive(),
    signature:              z.string().min(130).startsWith('0x'),
});

// EIP-712 domain and types for signature verification
const INTENT_DOMAIN = {
    name:    'PharosFlow',
    version: '1',
};
const INTENT_TYPES = {
    BridgingIntent: [
        { name: 'sourceUserAddress',      type: 'address' },
        { name: 'destinationUserAddress', type: 'address' },
        { name: 'sourceToken',            type: 'address' },
        { name: 'destinationToken',       type: 'address' },
        { name: 'amountIn',               type: 'uint256' },
        { name: 'minAmountOut',           type: 'uint256' },
        { name: 'sourceChainId',          type: 'uint256' },  // Fix M-6
        { name: 'targetChainId',          type: 'uint256' },
        { name: 'deadline',               type: 'uint256' },
    ]
};

// ── ADMIN: Generate API key ───────────────────────────────────────────────────
app.post('/v1/admin/generate-key', async (req, res) => {
    try {
        const { adminKey, orgName, tier } = req.body;

        if (!adminKey || !orgName || !tier) {
            return res.status(400).json({ error: 'adminKey, orgName, and tier are required' });
        }

        const incomingHash = crypto.createHash('sha256').update(adminKey).digest('hex');
        const expectedBuf  = Buffer.from(env.ADMIN_KEY_HASH, 'hex');
        const incomingBuf  = Buffer.from(incomingHash, 'hex');

        if (expectedBuf.length !== incomingBuf.length || !crypto.timingSafeEqual(expectedBuf, incomingBuf)) {
            logger.warn('Failed admin key attempt', { ip: req.ip });
            return res.status(403).json({ error: 'Forbidden' });
        }

        const VALID_TIERS = ['free', 'builder', 'pro', 'enterprise'];
        if (!VALID_TIERS.includes(tier)) {
            return res.status(400).json({ error: `tier must be one of: ${VALID_TIERS.join(', ')}` });
        }

        const rawKey = 'pk_live_' + crypto.randomBytes(32).toString('hex');
        const hash   = crypto.createHash('sha256').update(rawKey).digest('hex');

        await db.createApiKey(orgName, tier, hash);
        res.json({ orgName, tier, apiKey: rawKey });  // Raw key shown once, never stored
    } catch (err: any) {
        logger.error('generate-key error', { error: err.message });
        // Fix M3: no leak of internals
        res.status(500).json({ error: 'Key generation failed' });
    }
});

// ── /v1/quote ─────────────────────────────────────────────────────────────────
app.post('/v1/quote', async (req, res) => {
    const end = routeLatencyHistogram.startTimer();

    // Fix H1: Schema validation
    const parsed = QuoteSchema.safeParse(req.body);
    if (!parsed.success) {
        end();
        quoteRequestsTotal.inc({ status: 'error' });
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors });
    }

    try {
        logger.info(`Quote: chain ${parsed.data.fromChain} → ${parsed.data.toChain}`);
        const routeResponse = await axios.post(`${env.ROUTER_API_URL}/route`, parsed.data, { timeout: 15000 });
        quoteRequestsTotal.inc({ status: 'success' });
        end();
        res.json(routeResponse.data);
    } catch (err: any) {
        quoteRequestsTotal.inc({ status: 'error' });
        end();
        logger.error('Router proxy error', { error: err.message });
        if (err.response) {
            res.status(err.response.status).json(err.response.data);
        } else {
            res.status(503).json({ error: 'Routing service temporarily unavailable' });
        }
    }
});

// ── /v1/execute ───────────────────────────────────────────────────────────────
app.post('/v1/execute', async (req, res) => {
    // Fix H1: Schema validation on the intent
    if (!req.body?.intent) {
        return res.status(400).json({ error: 'Missing intent payload' });
    }

    const parsed = IntentSchema.safeParse(req.body.intent);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid intent', details: parsed.error.flatten().fieldErrors });
    }

    const intent = parsed.data;

    // Fix H3: Deadline validation — reject expired intents
    const nowSec = Math.floor(Date.now() / 1000);
    if (intent.deadline < nowSec) {
        return res.status(400).json({ error: `Intent expired at ${new Date(intent.deadline * 1000).toISOString()}` });
    }
    // Reject intents with deadlines more than 2 hours in the future (prevents indefinite replay window)
    if (intent.deadline > nowSec + 7200) {
        return res.status(400).json({ error: 'Intent deadline too far in the future (max 2 hours)' });
    }

    // Fix M-6: Domain chainId must be the SOURCE chain — where the user signed the TX.
    // Using targetChainId was wrong: it bound the signature to the destination chain.
    try {
        const domain = { ...INTENT_DOMAIN, chainId: intent.sourceChainId };
        // Fix H-2: destinationUserAddress may differ from sourceUserAddress (e.g. Safe on dest chain)
        const destAddr = intent.destinationUserAddress ?? intent.sourceUserAddress;
        const recovered = ethers.verifyTypedData(domain, INTENT_TYPES, {
            sourceUserAddress:      intent.sourceUserAddress,
            destinationUserAddress: destAddr,
            sourceToken:            intent.sourceToken,
            destinationToken:       intent.destinationToken,
            amountIn:               BigInt(intent.amountIn),
            minAmountOut:           BigInt(intent.minAmountOut),
            sourceChainId:          BigInt(intent.sourceChainId),
            targetChainId:          BigInt(intent.targetChainId),
            deadline:               BigInt(intent.deadline),
        }, intent.signature);

        if (recovered.toLowerCase() !== intent.sourceUserAddress.toLowerCase()) {
            logger.warn('Signature mismatch on intent', { recovered, claimed: intent.sourceUserAddress });
            return res.status(401).json({ error: 'Signature does not match sourceUserAddress' });
        }
    } catch (sigErr: any) {
        return res.status(400).json({ error: 'Invalid EIP-712 signature' });
    }

    // Fix H4: Replay protection — derive deterministic intentHash from signature
    const intentHash = '0x' + crypto.createHash('sha256').update(intent.signature).digest('hex');
    const alreadyUsed = await redis.get(`intent:used:${intentHash}`);
    if (alreadyUsed) {
        return res.status(409).json({ error: 'Intent already executed (replay rejected)', intentHash });
    }

    try {
        logger.info('Forwarding verified intent to executor', { intentHash });
        const execResponse = await axios.post(`${env.EXECUTOR_API_URL}/execute-intent`, {
            intent: {
                ...intent,
                // Fix H-2: resolve destinationUserAddress before forwarding
                destinationUserAddress: intent.destinationUserAddress ?? intent.sourceUserAddress,
            }
        }, {
            timeout: 30000,
            // Fix C-1: Pass the internal secret so executor auth middleware accepts the request
            headers: { 'x-internal-secret': env.INTERNAL_SECRET },
        });

        // Mark intent as used in Redis with TTL matching the max deadline window (2 hours)
        await redis.setex(`intent:used:${intentHash}`, 7200, '1');

        executeRequestsTotal.inc({ status: 'success' });

        // Fire webhook notifications asynchronously (don't block the response)
        webhookService.dispatch('intent.submitted', {
            event:        'intent.submitted',
            trackingHash: execResponse.data.trackingHash ?? execResponse.data.intentHash ?? '',
            bridgeVenue:  'pending',
            status:       'BROADCASTING',
            amount:       intent.amountIn,
            timestamp:    Date.now(),
        }).catch(e => logger.warn('Webhook dispatch failed (non-critical)', { error: e.message }));

        res.json(execResponse.data);
    } catch (err: any) {
        executeRequestsTotal.inc({ status: 'error' });
        logger.error('Executor proxy error', { error: err.message });
        if (err.response) {
            res.status(err.response.status).json(err.response.data);
        } else {
            res.status(503).json({ error: 'Execution service temporarily unavailable' });
        }
    }
});

// ── /v1/status/:trackingHash ─────────────────────────────────────────────────
app.get('/v1/status/:trackingHash', async (req, res) => {
    const { trackingHash } = req.params;

    // Fix M5: Validate trackingHash format before using it as a cache/DB key
    if (!trackingHash.match(/^0x[a-fA-F0-9]{64}$/)) {
        return res.status(400).json({ error: 'Invalid tracking hash format (expected 0x + 64 hex chars)' });
    }

    try {
        const cached = await redis.get(`bridge:status:${trackingHash}`);
        if (cached) return res.json(JSON.parse(cached));

        const result = await db.pool.query(
            `SELECT tracking_hash, source_chain_id, destination_chain_id,
                    bridge_venue, status, amount, fee_collected, error_message, created_at, updated_at
             FROM bridge_events WHERE tracking_hash = $1`,
            [trackingHash]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No event found for tracking hash' });
        }

        const row  = result.rows[0]!;
        const data = {
            trackingHash:       row.tracking_hash,
            sourceChainId:      row.source_chain_id,
            destinationChainId: row.destination_chain_id,
            bridgeVenue:        row.bridge_venue,
            status:             row.status,
            amount:             row.amount,
            feeCollected:       row.fee_collected,
            errorMessage:       row.error_message,
            createdAt:          row.created_at,
            updatedAt:          row.updated_at,
        };

        await redis.setex(`bridge:status:${trackingHash}`, 30, JSON.stringify(data));
        return res.json(data);
    } catch (err: any) {
        logger.error('Status lookup error', { error: err.message });
        return res.status(500).json({ error: 'Status lookup failed' });
    }
});

// ── /v1/compliance/:address ───────────────────────────────────────────────────
app.get('/v1/compliance/:address', async (req, res) => {
    const { address } = req.params;
    const chainId = Number(req.query.chainId ?? 1);

    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
        return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    try {
        // Fix M1: Reduced TTL from 300s → 60s for compliance data
        const cacheKey = `compliance:${address.toLowerCase()}:${chainId}`;
        const cached = await redis.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));

        const result = await db.pool.query(
            `SELECT is_kyced, aml_risk, is_rwa, required_bridges, jurisdictions
             FROM kyc_flags WHERE LOWER(address) = $1 AND chain_id = $2
             ORDER BY created_at DESC LIMIT 1`,
            [address.toLowerCase(), chainId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No compliance data found', address, chainId });
        }

        const row  = result.rows[0]!;
        const data = {
            address, chainId,
            isKYCed:        row.is_kyced,
            amlRisk:        row.aml_risk,
            isRwa:          row.is_rwa,
            requiredBridges: row.required_bridges,
            jurisdictions:  row.jurisdictions,
        };

        await redis.setex(cacheKey, 60, JSON.stringify(data));  // Fix M1: 60s TTL
        return res.json(data);
    } catch (err: any) {
        logger.error('Compliance lookup error', { error: err.message });
        return res.status(500).json({ error: 'Compliance lookup failed' });
    }
});

// ── /health ──────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
    try {
        await db.pool.query('SELECT 1');
        await redis.ping();
        res.json({ status: 'ok', apiGateway: 'active', db: 'connected', redis: 'connected' });
    } catch (err: any) {
        // Fix M3: Don't leak DB connection details in health response
        res.status(500).json({ status: 'degraded', error: 'One or more dependencies unreachable' });
    }
});

// ── Fix L5: Redirect HTTP → HTTPS in production ───────────────────────────────
app.use((req, res, next) => {
    if (env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
});

// ── Startup ──────────────────────────────────────────────────────────────────
async function main() {
    const server = app.listen(env.PORT, () => {
        logger.info(`Pharosflow API Gateway on port ${env.PORT} [${env.NODE_ENV}]`);
    });

    // Monthly quota reset at midnight UTC on the 1st of every month
    cron.schedule('0 0 1 * *', async () => {
        logger.info('Running monthly API quota reset...');
        try {
            const result = await db.pool.query(
                `UPDATE api_keys SET monthly_requests_used = 0,
                 monthly_reset_at = (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')`
            );
            logger.info(`Monthly quota reset complete. Rows: ${result.rowCount}`);
        } catch (err) {
            logger.error('Monthly quota reset failed', err);
        }
    }, { timezone: 'UTC' });

    const shutdown = async () => {
        logger.info('Shutdown signal received.');
        server.close();
        await redis.quit();
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

if (require.main === module) {
    main().catch(e => logger.error('Startup crash', e));
}
