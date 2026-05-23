import { LiquidityGraph } from './graph/LiquidityGraph';
import { TOKENS } from './graph/tokenRegistry';
import { bridgeRegistry } from './bridges/BridgeRegistry';

async function main() {
    console.log('=== Graph Diagnostics ===');
    console.log(`Registered bridge adapters: ${bridgeRegistry.getAllAdapters().length}`);
    
    const graph = new LiquidityGraph();
    // wait for Redis connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    await graph.refreshGraph();

    const snapshot = graph.getGraphSnapshot();
    console.log(`Graph node count: ${snapshot.nodes}`);

    // Print a few sample nodes and their edges
    const sampleNodes = [
        '8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC on Base (lowercase)
        '1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',    // USDC on Ethereum (lowercase)
    ];

    for (const nodeId of sampleNodes) {
        const edges = graph.getOutgoingEdges(nodeId);
        console.log(`\nOutgoing edges for ${nodeId} (count: ${edges.length}):`);
        for (const edge of edges.slice(0, 10)) {
            console.log(`  ➔ ${edge.targetId} via ${edge.venue} (weight: ${edge.weight})`);
        }
    }

    graph.disconnect();
    process.exit(0);
}

main().catch(console.error);
