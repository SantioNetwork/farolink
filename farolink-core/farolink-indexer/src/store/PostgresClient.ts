import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const dbUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/pharos";

export const pgPool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes("localhost") ? false : { rejectUnauthorized: false }
});

pgPool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
    process.exit(-1);
});

export async function initDb() {
    const client = await pgPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS goldsky_liquidity (
                id SERIAL PRIMARY KEY,
                chain_id INT,
                pair_address VARCHAR(255),
                token0 VARCHAR(255),
                token1 VARCHAR(255),
                reserves JSONB,
                volume_24h NUMERIC,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS goldsky_spn (
                id SERIAL PRIMARY KEY,
                message_id VARCHAR(255) UNIQUE,
                sender VARCHAR(255),
                dest_chain_id INT,
                status VARCHAR(50),
                latency_ms INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS goldsky_kyc (
                id SERIAL PRIMARY KEY,
                address VARCHAR(255),
                chain_id INT,
                is_kyced BOOLEAN,
                aml_risk NUMERIC,
                jurisdictions JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } finally {
        client.release();
    }
}
