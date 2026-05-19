import { ethers } from "hardhat";

/**
 * PharosFlow Production Deployment Script
 *
 * Security checklist enforced by this script:
 *  ✅ Deploys PharosFlowRouter + FeeCollector
 *  ✅ Fix H5: Transfers ownership to a Gnosis Safe multisig (not the deployer EOA)
 *  ✅ Approves only audited bridge adapters
 *  ✅ Verifies ownership transfer completed before finishing
 *
 * Usage:
 *   MULTISIG=0x... npx hardhat run scripts/deploy.ts --network pharosTestnet
 */

const BRIDGE_ADAPTERS: { name: string; envKey: string }[] = [
    { name: "LayerZero",    envKey: "LAYERZERO_ENDPOINT_ADDRESS" },
    { name: "CCIP",         envKey: "CHAINLINK_CCIP_ROUTER"      },
    { name: "CCTP",         envKey: "CIRCLE_CCTP_MESSENGER"      },
    { name: "Axelar",       envKey: "AXELAR_GATEWAY_ADDRESS"     },
    { name: "Wormhole",     envKey: "WORMHOLE_BRIDGE_ADDRESS"    },
    { name: "deBridge",     envKey: "DEBRIDGE_DLN_ADDRESS"       },
    { name: "PharosNative", envKey: "PHAROS_BRIDGE_ADDRESS"      },
];

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("Balance: ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

    // ── Fix H5: Require multisig address from environment ─────────────────────
    const MULTISIG = process.env.MULTISIG_ADDRESS ?? "";
    if (!MULTISIG || !ethers.isAddress(MULTISIG)) {
        throw new Error(
            "MULTISIG_ADDRESS env var is required and must be a valid address.\n" +
            "Set it to your Gnosis Safe address before deploying to production."
        );
    }
    console.log("Ownership will transfer to multisig:", MULTISIG, "\n");

    // ── 1. Deploy FeeCollector ─────────────────────────────────────────────────
    console.log("Deploying FeeCollector...");
    const FeeCollector = await ethers.getContractFactory("FeeCollector");
    const feeCollector = await FeeCollector.deploy();
    await feeCollector.waitForDeployment();
    const feeCollectorAddress = await feeCollector.getAddress();
    console.log("✅ FeeCollector deployed:", feeCollectorAddress);

    // ── 2. Deploy PharosFlowRouter ─────────────────────────────────────────────
    console.log("\nDeploying PharosFlowRouter...");
    const Router = await ethers.getContractFactory("PharosFlowRouter");
    const router = await Router.deploy(feeCollectorAddress);
    await router.waitForDeployment();
    const routerAddress = await router.getAddress();
    console.log("✅ PharosFlowRouter deployed:", routerAddress);

    // ── 3. Approve bridge adapters ─────────────────────────────────────────────
    console.log("\nApproving bridge adapters...");
    for (const adapter of BRIDGE_ADAPTERS) {
        const addrEnv = process.env[adapter.envKey] ?? "";
        if (!addrEnv || !ethers.isAddress(addrEnv)) {
            console.log(`  ⚠ Skipping ${adapter.name} — ${adapter.envKey} not set`);
            continue;
        }
        const tx = await (router as any).approveAdapter(addrEnv, true);
        await tx.wait();
        console.log(`  ✅ ${adapter.name} approved: ${addrEnv}`);
    }

    // ── 4. Fix H5: Transfer ownership to multisig ─────────────────────────────
    console.log("\nTransferring Router ownership to multisig...");
    const routerOwnerTx = await (router as any).transferOwnership(MULTISIG);
    await routerOwnerTx.wait();

    console.log("\nTransferring FeeCollector ownership to multisig...");
    const fcOwnerTx = await (feeCollector as any).transferOwnership(MULTISIG);
    await fcOwnerTx.wait();

    // ── 5. Verify ownership transferred correctly ──────────────────────────────
    const newRouterOwner = await (router as any).owner();
    const newFcOwner     = await (feeCollector as any).owner();

    if (newRouterOwner.toLowerCase() !== MULTISIG.toLowerCase()) {
        throw new Error(`CRITICAL: Router owner is ${newRouterOwner}, not multisig! Manual intervention required.`);
    }
    if (newFcOwner.toLowerCase() !== MULTISIG.toLowerCase()) {
        throw new Error(`CRITICAL: FeeCollector owner is ${newFcOwner}, not multisig!`);
    }

    console.log("\n══════════════════════════════════════════════════════");
    console.log("✅ DEPLOYMENT COMPLETE");
    console.log("══════════════════════════════════════════════════════");
    console.log("PharosFlowRouter: ", routerAddress);
    console.log("FeeCollector:     ", feeCollectorAddress);
    console.log("Owner (multisig): ", MULTISIG);
    console.log("\n📋 Add these to your .env:");
    console.log(`FEE_COLLECTOR_ADDRESS=${feeCollectorAddress}`);
    console.log(`PHAROSFLOW_ROUTER_ADDRESS=${routerAddress}`);
    console.log("══════════════════════════════════════════════════════");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
