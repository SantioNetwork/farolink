import { Pool } from 'pg';
import winston from 'winston';

export class Database {
    public pool: Pool;

    constructor(connectionString: string, private logger: winston.Logger) {
        this.pool = new Pool({
            connectionString: connectionString,
            max: 20, // Connection pooling limit
            idleTimeoutMillis: 30000,
            ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false }
        });

        this.pool.on('error', (err) => {
            this.logger.error('Unexpected error on idle PG client', err);
        });
    }

    /**
     * Authenticates an API key hash against the Postgres table 
     * and increments their monthly usage block.
     * @param keyHash SHA-256 hash of the API key
     * @returns User data if valid, otherwise null
     */
    async trackAndValidateKey(keyHash: string) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const res = await client.query(
                'SELECT tier, monthly_requests_used, is_active FROM api_keys WHERE key_hash = $1 FOR UPDATE',
                [keyHash]
            );

            if (res.rows.length === 0 || !res.rows[0].is_active) {
                await client.query('ROLLBACK');
                return null;
            }

            const user = res.rows[0];
            
            // Check Quotas
            const quotaLimits: any = {
                'free': 100,
                'builder': 5000,
                'pro': 50000,
                'enterprise': Infinity
            };

            if (user.monthly_requests_used >= quotaLimits[user.tier]) {
                await client.query('ROLLBACK');
                throw new Error(`Rate limit exceeded for tier: ${user.tier}`);
            }

            // Increment usage
            await client.query(
                'UPDATE api_keys SET monthly_requests_used = monthly_requests_used + 1 WHERE key_hash = $1',
                [keyHash]
            );

            await client.query('COMMIT');
            return user;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Generates and stores a new API key natively
     */
    async createApiKey(orgName: string, tier: string, keyHash: string) {
        await this.pool.query(
            'INSERT INTO api_keys (organization_name, key_hash, tier) VALUES ($1, $2, $3)',
            [orgName, keyHash, tier]
        );
    }
}
