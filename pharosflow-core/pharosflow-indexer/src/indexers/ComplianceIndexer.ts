import { redisCache, redisPub } from '../store/RedisClient';
import { pgPool } from '../store/PostgresClient';
import winston from 'winston';
import axios from 'axios';
import pRetry from 'p-retry';
import { env } from '../config/env';

const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

export class ComplianceIndexer {
    async refreshCacheFromGoldsky(address: string, chainId: number): Promise<void> {
        const redisKey = `compliance:${address}:${chainId}`;
        
        // 1. Check Redis
        const cached = await redisCache.get(redisKey);
        if (cached) {
            logger.debug(`Compliance cache hit for ${address} on chain ${chainId}`);
            return;
        }

        // 2. Check Postgres
        const pgResult = await pgPool.query(
            `SELECT * FROM kyc_flags WHERE address = $1 AND chain_id = $2 ORDER BY created_at DESC LIMIT 1`,
            [address, chainId]
        );

        let kycData: any = null;

        if (pgResult.rows.length > 0) {
            const row = pgResult.rows[0];
            kycData = {
                isKYCed: row.is_kyced,
                amlRisk: row.aml_risk,
                jurisdictions: row.jurisdictions
            };
        } else {
            // 3. Fallback to HTTP KYC endpoint with robustness
            const apiKey = env.PHAROS_KYC_API_KEY;
            if (!apiKey) {
                logger.warn('PHAROS_KYC_API_KEY missing, cannot fallback to HTTP API');
                return;
            }

            try {
                // Using p-retry with exponential backoff for REST API robustness
                kycData = await pRetry(async () => {
                    const res = await axios.get(`https://api.pharos.network/kyc/${address}`, {
                        params: { chainId },
                        headers: { 'Authorization': `Bearer ${apiKey}` },
                        timeout: 5000 // 5s timeout to prevent hanging connections
                    });
                    return res.data;
                }, {
                    retries: 3,
                    onFailedAttempt: error => {
                        logger.warn(`KYC API attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
                    }
                });

                // Sync the freshly fetched data down into PG
                await pgPool.query(
                    `INSERT INTO kyc_flags (address, chain_id, is_kyced, aml_risk, jurisdictions) VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (address, chain_id) DO UPDATE SET is_kyced = $3, aml_risk = $4, jurisdictions = $5`,
                    [address, chainId, kycData.isKYCed, kycData.amlRisk, JSON.stringify(kycData.jurisdictions)]
                );
            } catch (err) {
                logger.error('Failed to fetch from REST KYC API after retries', { error: err });
                return; // Stop processing, no data retrieved
            }
        }

        if (kycData) {
            // 4. Update the Cache and PubSub to notify Router layers
            await redisCache.setex(redisKey, 300, JSON.stringify(kycData));
            await redisPub.publish('compliance:updated', JSON.stringify({ address, chainId }));
        }
    }
}
