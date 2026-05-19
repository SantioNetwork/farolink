const { Client } = require('pg');
require('dotenv').config();

async function diagnose() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log('Connected\n');

  // 1. Check actual columns in goldsky_liquidity
  const cols = await c.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='goldsky_liquidity' ORDER BY ordinal_position"
  );
  console.log('goldsky_liquidity columns:');
  cols.rows.forEach(r => console.log(' ', r.column_name, '|', r.data_type));

  // 2. Sample 3 rows — especially token0/token1
  const sample = await c.query('SELECT id, pair_address, chain_id, token0, token1, volume_24h FROM goldsky_liquidity LIMIT 3');
  console.log('\nSample rows:');
  sample.rows.forEach(r => console.log(' ', JSON.stringify(r)));

  // 3. Try the exact GoldskyConsumer query — does it fail on "reserves"?
  try {
    const gq = await c.query(
      'SELECT id, chain_id, pair_address, token0, token1, reserves, volume_24h FROM goldsky_liquidity WHERE id > 0 ORDER BY id ASC LIMIT 1'
    );
    console.log('\nGoldskyConsumer query result:', gq.rows[0]);
  } catch(e) {
    console.log('\nGoldskyConsumer query ERROR:', e.message);
    console.log('>>> This is why no data flows to Redis!');
  }

  // 4. Check Redis watermark
  const { createClient } = require('redis');
  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();
  const wm = await redis.get('indexer:watermark:liquidity');
  console.log('\nRedis watermark (indexer:watermark:liquidity):', wm || '0 (never progressed)');

  const keys = await redis.keys('liquidity:*');
  console.log('Redis liquidity:* keys:', keys.length, 'total');
  if (keys.length > 0) console.log('Sample:', keys.slice(0,3));

  const poolKeys = await redis.keys('pool:*');
  console.log('Redis pool:* keys (router graph):', poolKeys.length, 'total');
  if (poolKeys.length > 0) console.log('Sample:', poolKeys.slice(0,3));

  await redis.quit();
  await c.end();
}

diagnose().catch(e => console.error('Error:', e.message));
