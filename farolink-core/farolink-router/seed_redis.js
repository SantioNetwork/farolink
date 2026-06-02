const Redis = require('ioredis');

const REDIS_URL = 'rediss://default:AaFXAAIgcDFiNGQwNmM3MTAyNTk0ZjM1YjRhNjc5ZjRlM2RhZTU5OA@cosmic-lamprey-41303.upstash.io:6379';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  family: 4,
  tls: { rejectUnauthorized: false }
});

async function main() {
  console.log('Seeding mock RWA liquidity...');
  
  const pools = [
    // Pharos Testnet (688689)
    {
      key: 'liquidity:688689:0xMockUsdmUsdcPharos',
      data: {
        token0: '0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C', // USDM
        token1: '0xe0be08c77f415f577a1b3a9ad7a1df1479564ec8', // USDC (Pharos)
        reserves: ["1000000000000000000000000", "1000000000000"] // 1M USDM (18 dec) : 1M USDC (6 dec)
      }
    },
    {
      key: 'liquidity:688689:0xMockUsdyUsdcPharos',
      data: {
        token0: '0x96f6ef951840721adbf46ac996b59e0235cb985c', // USDY
        token1: '0xe0be08c77f415f577a1b3a9ad7a1df1479564ec8', // USDC (Pharos)
        reserves: ["1000000000000000000000000", "1000000000000"] // 1M USDY (18 dec) : 1M USDC (6 dec)
      }
    },
    
    // Ethereum (1)
    {
      key: 'liquidity:1:0xMockUsdmUsdcEth',
      data: {
        token0: '0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C', // USDM
        token1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC (ETH)
        reserves: ["1000000000000000000000000", "1000000000000"]
      }
    },
    {
      key: 'liquidity:1:0xMockUsdyUsdcEth',
      data: {
        token0: '0x96f6ef951840721adbf46ac996b59e0235cb985c', // USDY
        token1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC (ETH)
        reserves: ["1000000000000000000000000", "1000000000000"]
      }
    }
  ];

  for (const pool of pools) {
    await redis.set(pool.key, JSON.stringify(pool.data));
    console.log(`Set ${pool.key}`);
  }

  console.log('Done!');
  process.exit(0);
}

main().catch(console.error);
