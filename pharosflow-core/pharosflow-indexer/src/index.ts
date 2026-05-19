import express from 'express';
import winston from 'winston';
import dns from 'dns';

// Force Node to use IPv4 first to avoid Neon connection timeouts on machines with broken IPv6 routing
dns.setDefaultResultOrder('ipv4first');
import { env } from './config/env';
import { initDb, pgPool } from './store/PostgresClient';
import { redisCache, redisPub } from './store/RedisClient';
import { GoldskyConsumer } from './indexers/GoldskyConsumer';
import { ComplianceIndexer } from './indexers/ComplianceIndexer';

const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

async function main() {
    logger.info('Starting Pharosflow Indexer Service...');

    // 1. Initialize databases
    await initDb();
    logger.info('Database initialized successfully');

    // 2. Start Goldsky Consumer
    const consumer = new GoldskyConsumer();
    await consumer.start();

    // 3. Start Compliance Indexer — periodically warm KYC/AML cache for known RWA tokens
    const complianceIndexer = new ComplianceIndexer();
    const RWA_ADDRESSES = [
        // Pharos RWA token addresses (USDM, USDY, S-UST, etc.)
        '0x3b9a5be61e454e6e697e24e1b34e4b5d08be6e40',
        '0x7c5fbd57a75f92b4fb75f31d3f9f5c0f73c6e7a8',
    ];
    // Refresh compliance data every 5 minutes
    setInterval(async () => {
        for (const addr of RWA_ADDRESSES) {
            await complianceIndexer.refreshCacheFromGoldsky(addr, 688689).catch(e =>
                logger.warn(`Compliance refresh failed for ${addr}`, { error: e.message })
            );
        }
    }, 5 * 60 * 1000);
    logger.info(`ComplianceIndexer active — monitoring ${RWA_ADDRESSES.length} RWA addresses`);

    // 4. Health & Metrics Server
    const app = express();
    
    app.get('/health', async (req, res) => {
        try {
            await pgPool.query('SELECT 1');
            res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
        } catch (err) {
            res.status(500).json({ status: 'error', db: 'disconnected' });
        }
    });

    app.get('/metrics', (req, res) => {
        // Prometheus metrics integration point
        res.set('Content-Type', 'text/plain');
        res.send('# HELP indexer_health Indicator of indexer health\nindexer_health 1\n');
    });

    const server = app.listen(env.PORT, () => {
        logger.info(`Health server running on port ${env.PORT}`);
    });

    // 4. Graceful Shutdown
    const shutdown = async () => {
        logger.info('Shutdown signal received, shutting down gracefully...');
        await consumer.stop();
        server.close();
        await pgPool.end();
        redisCache.disconnect();
        redisPub.disconnect();
        logger.info('Shutdown complete.');
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

main().catch(err => {
    logger.error('Startup crash', err);
    process.exit(1);
});
