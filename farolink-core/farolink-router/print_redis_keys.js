const Redis = require('ioredis');
const REDIS_URL = 'rediss://default:AaFXAAIgcDFiNGQwNmM3MTAyNTk0ZjM1YjRhNjc5ZjRlM2RhZTU5OA@cosmic-lamprey-41303.upstash.io:6379';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  family: 4,
  tls: { rejectUnauthorized: false }
});

async function main() {
  const keys = await redis.keys('liquidity:688689:*');
  console.log(`Found ${keys.length} keys for Pharos Testnet (688689)`);
  for (const key of keys) {
    const val = await redis.get(key);
    console.log(key, val);
  }
  await redis.quit();
}

main().catch(console.error);
