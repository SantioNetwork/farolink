const { Pool } = require('pg');

const p = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_L2WDwVrsMQ9p@ep-damp-haze-ape8sgh0-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const sql = `
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  organization_name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(64) UNIQUE NOT NULL,
  tier VARCHAR(20) NOT NULL DEFAULT 'free',
  monthly_requests_used INT DEFAULT 0,
  monthly_reset_at TIMESTAMP DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month'),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bridge_events (
  id SERIAL PRIMARY KEY,
  tracking_hash VARCHAR(66) UNIQUE NOT NULL,
  source_chain_id INT,
  destination_chain_id INT,
  bridge_venue VARCHAR(50),
  status VARCHAR(30) DEFAULT 'pending',
  amount NUMERIC,
  fee_collected NUMERIC,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kyc_flags (
  id SERIAL PRIMARY KEY,
  address VARCHAR(42) NOT NULL,
  chain_id INT NOT NULL,
  is_kyced BOOLEAN DEFAULT false,
  aml_risk NUMERIC DEFAULT 0,
  is_rwa BOOLEAN DEFAULT false,
  required_bridges TEXT[],
  jurisdictions JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

p.query(sql)
  .then(() => { console.log('ALL TABLES CREATED OK'); p.end(); })
  .catch(e => { console.error('FAIL:', e.message); p.end(); });
