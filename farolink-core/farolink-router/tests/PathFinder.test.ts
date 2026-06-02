import { PathFinder } from '../src/engine/PathFinder';
import { LiquidityGraph } from '../src/graph/LiquidityGraph';
import { RouteRequest } from '../src/types/route';

// Mock the graph so we don't need a live Redis instance in CI
jest.mock('../src/graph/LiquidityGraph');

describe('FaroLink PathFinder Algorithm', () => {
    let mockGraph: jest.Mocked<LiquidityGraph>;
    let pathFinder: PathFinder;

    beforeEach(() => {
        mockGraph = new LiquidityGraph() as jest.Mocked<LiquidityGraph>;

        // Fix #10: The real method is getOutgoingEdges, not getAdjacentNodes
        mockGraph.getOutgoingEdges.mockImplementation((nodeId: string) => {
            if (nodeId === '1:0xmocketh') {
                return [
                    {
                        sourceId: '1:0xmocketh',
                        targetId: '1337:0xmocketh',
                        venue:    'debridge',
                        weight:   1.002,  // deBridge: low fee, risk score 0
                        baseFee:  20,
                    },
                    {
                        sourceId: '1:0xmocketh',
                        targetId: '1337:0xmocketh',
                        venue:    'layerzero',
                        weight:   1.005,  // LayerZero: higher fee
                        baseFee:  50,
                    },
                ];
            }
            return [];
        });

        pathFinder = new PathFinder(mockGraph);
    });

    it('should find a route and return correct structure', async () => {
        const req: RouteRequest = {
            fromChain: 1,
            toChain:   1337,
            fromToken: '0xmocketh',
            toToken:   '0xmocketh',
            amountIn:  1000000000n,
            slippageToleranceBps: 50,
            userAddress: '0xUserWallet',
        };

        const result = await pathFinder.findBestRoute(req);

        expect(result).not.toBeNull();
        expect(result!.hops.length).toBeGreaterThan(0);
        expect(result!.amountIn).toBe('1000000000');
        expect(BigInt(result!.expectedOutput)).toBeLessThan(req.amountIn); // fee deducted
    });

    it('should prefer the lowest-weight route (deBridge over layerzero)', async () => {
        const req: RouteRequest = {
            fromChain: 1,
            toChain:   1337,
            fromToken: '0xmocketh',
            toToken:   '0xmocketh',
            amountIn:  1000000000n,
            slippageToleranceBps: 50,
        };

        const result = await pathFinder.findBestRoute(req);

        expect(result).not.toBeNull();
        // deBridge has weight 1.002, layerzero has weight 1.005 — should pick deBridge
        expect(result!.hops[0].venue).toBe('debridge');
    });

    it('should return null if no route exists', async () => {
        // Make graph return no edges for any node
        mockGraph.getOutgoingEdges.mockReturnValue([]);

        const req: RouteRequest = {
            fromChain: 1,
            toChain:   1337,
            fromToken: '0xmocketh',
            toToken:   '0xmocketh',
            amountIn:  1000n,
            slippageToleranceBps: 50,
        };

        const result = await pathFinder.findBestRoute(req);
        expect(result).toBeNull();
    });

    it('should compute per-hop output correctly (not equal to amountIn)', async () => {
        const amountIn = 1000000000000000000n; // 1 token
        const req: RouteRequest = {
            fromChain: 1,
            toChain:   1337,
            fromToken: '0xmocketh',
            toToken:   '0xmocketh',
            amountIn,
            slippageToleranceBps: 50,
        };

        const result = await pathFinder.findBestRoute(req);

        expect(result).not.toBeNull();
        // Fix #8: estimatedOutput per hop must be LESS than amountIn (fee deducted)
        const hopOutput = BigInt(result!.hops[0].estimatedOutput);
        expect(hopOutput).toBeLessThan(amountIn);
        expect(hopOutput).toBeGreaterThan(0n);
    });

    it('should select parallel pool that maximizes output rate over pool with bad exchange rate', async () => {
        mockGraph.getOutgoingEdges.mockImplementation((nodeId: string) => {
            if (nodeId === '688689:0xmockweth') {
                return [
                    {
                        sourceId:    '688689:0xmockweth',
                        targetId:    '688689:0xmockusdc',
                        venue:       'dex_pool',
                        weight:      1.003,
                        baseFee:     30,
                        reserves:    6805000000000000000000n,    // Bad pool: 6805 WETH
                        reserves1:   111362000000n,              // Bad pool: 111362 USDC (~$16 per WETH)
                        poolAddress: '0xbadpool',
                    },
                    {
                        sourceId:    '688689:0xmockweth',
                        targetId:    '688689:0xmockusdc',
                        venue:       'dex_pool',
                        weight:      1.003,
                        baseFee:     30,
                        reserves:    3125000000000000000000n,    // Good pool: 3125 WETH
                        reserves1:   10000000000000n,            // Good pool: 10M USDC (~$3200 per WETH)
                        poolAddress: '0xgoodpool',
                    }
                ];
            }
            return [];
        });

        const req: RouteRequest = {
            fromChain: 688689,
            toChain:   688689,
            fromToken: '0xmockweth',
            toToken:   '0xmockusdc',
            amountIn:  1000000000000000000n, // 1 WETH
            slippageToleranceBps: 50,
        };

        const result = await pathFinder.findBestRoute(req);

        expect(result).not.toBeNull();
        expect(result!.hops.length).toBe(1);
        // It must select the pool with the much better output rate (0xgoodpool)
        expect(result!.hops[0].poolAddress).toBe('0xgoodpool');
        expect(BigInt(result!.expectedOutput)).toBeGreaterThan(3000000000n); // Output should be ~3189 USDC
    });
});

