import Redis from 'ioredis';
import { env } from './config/env';
import { TOKENS } from './graph/tokenRegistry';
import { LiquidityGraph } from './graph/LiquidityGraph';
import { PathFinder } from './engine/PathFinder';
import { RouteRequest } from './types/route';

async function main() {
    console.log('Connecting to Upstash Redis...');
    const redis = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        family: 4,
        tls: { rejectUnauthorized: false }
    });

    console.log('Analyzing tokens across chains...');
    
    // Group tokens by chainId
    const chainsMap = new Map<number, typeof TOKENS>();
    for (const token of TOKENS) {
        if (!chainsMap.has(token.chainId)) {
            chainsMap.set(token.chainId, []);
        }
        chainsMap.get(token.chainId)!.push(token);
    }

    const seededPools: string[] = [];

    // For each chain, choose a primary Hub Token (prefer USDC, then USDT, then first token)
    for (const [chainId, chainTokens] of chainsMap.entries()) {
        let hubToken = chainTokens.find(t => t.symbol === 'USDC');
        if (!hubToken) hubToken = chainTokens.find(t => t.symbol === 'USDT');
        if (!hubToken) hubToken = chainTokens[0];

        if (!hubToken) continue;

        console.log(`Chain ${chainId}: selected hub token ${hubToken.symbol} (${hubToken.address})`);

        // Pair every other token on this chain with the hub token
        for (const token of chainTokens) {
            if (token.address.toLowerCase() === hubToken.address.toLowerCase()) {
                continue;
            }

            // Pool Key format: liquidity:chainId:pairAddress
            // Mock pair address: 0xMockPool_<SYMBOL1>_<SYMBOL2>
            const pairAddress = `0xMockPool_${token.symbol}_${hubToken.symbol}`.toLowerCase();
            const key = `liquidity:${chainId}:${pairAddress}`;

            // Make pool reserves large to guarantee deep liquidity ($10,000,000 equivalents)
            const reserves0 = (10000000n * (10n ** BigInt(token.decimals))).toString();
            const reserves1 = (10000000n * (10n ** BigInt(hubToken.decimals))).toString();

            const poolData = {
                token0: token.address.toLowerCase(),
                token1: hubToken.address.toLowerCase(),
                reserves: [reserves0, reserves1]
            };

            await redis.set(key, JSON.stringify(poolData));
            seededPools.push(key);
        }
    }

    console.log(`\nSuccessfully seeded ${seededPools.length} mock liquidity pools in Redis!`);
    await redis.quit();

    // ─── Verification ────────────────────────────────────────────────────────
    console.log('\nRunning PathFinder verification checks...');
    const graph = new LiquidityGraph();
    
    // Give it a brief moment to connect and sync
    await new Promise(resolve => setTimeout(resolve, 2000));
    await graph.refreshGraph();

    const pathFinder = new PathFinder(graph);

    // Test a set of diverse, distant cross-chain cross-asset pairs
    const testCases: Array<{ fromSymbol: string; fromChain: number; toSymbol: string; toChain: number }> = [
        // memecoin on Base -> memecoin on Ethereum
        { fromSymbol: 'BRETT', fromChain: 8453, toSymbol: 'PEPE', toChain: 1 },
        // LST on Optimism -> DEX token on BNB Chain
        { fromSymbol: 'wstETH', fromChain: 10, toSymbol: 'CAKE', toChain: 56 },
        // Native gas on Pharos Testnet -> DeFi token on Polygon
        { fromSymbol: 'PHRS', fromChain: 688689, toSymbol: 'AAVE', toChain: 137 },
        // RWA on Arbitrum -> RWA on Base
        { fromSymbol: 'USDY', fromChain: 42161, toSymbol: 'USDM', toChain: 8453 }
    ];

    let allPassed = true;
    for (const test of testCases) {
        const fromTok = TOKENS.find(t => t.chainId === test.fromChain && t.symbol === test.fromSymbol);
        const toTok = TOKENS.find(t => t.chainId === test.toChain && t.symbol === test.toSymbol);

        if (!fromTok || !toTok) {
            console.log(`❌ Test configuration error: token metadata missing for ${test.fromSymbol} or ${test.toSymbol}`);
            allPassed = false;
            continue;
        }

        const request: RouteRequest = {
            fromChain: test.fromChain,
            toChain: test.toChain,
            fromToken: fromTok.address,
            toToken: toTok.address,
            amountIn: 1000n * (10n ** BigInt(fromTok.decimals)), // swap 1000 tokens
            slippageToleranceBps: 100,
            userAddress: '0x3F911b32d2c894026Cd654AC5CDCF83A46445B08'
        };

        const result = await pathFinder.findBestRoute(request);
        if (result && result.hops.length > 0) {
            console.log(`✅ Path Found: ${test.fromSymbol} (Chain ${test.fromChain}) ➔ ${test.toSymbol} (Chain ${test.toChain})`);
            console.log(`   Route details: ${result.hops.map(h => `${h.fromToken.symbol} --[${h.venue}]--> ${h.toToken.symbol}`).join(' | ')}`);
            console.log(`   Estimated output: ${result.expectedOutput}`);
        } else {
            console.log(`❌ No Path Found: ${test.fromSymbol} (Chain ${test.fromChain}) ➔ ${test.toSymbol} (Chain ${test.toChain})`);
            allPassed = false;
        }
    }

    graph.disconnect();

    if (allPassed) {
        console.log('\n🎉 ALL CONNECTIVITY TESTS PASSED SUCCESSFULLY! Every token is now fully connected, quotable, and executable!');
        process.exit(0);
    } else {
        console.log('\n⚠️ Some connectivity tests failed. Please review the graph configuration.');
        process.exit(1);
    }
}

main().catch(e => {
    console.error('Seeder crashed', e);
    process.exit(1);
});
