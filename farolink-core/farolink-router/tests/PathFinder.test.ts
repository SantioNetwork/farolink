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
});
