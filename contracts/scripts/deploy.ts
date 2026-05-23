/**
 * Standalone deployment script using ethers.js directly.
 * Bypasses Hardhat's net_version chain validation which Pharos testnet doesn't support.
 */
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

// Load the compiled artifact
const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "FaroLinkRouter.sol", "FaroLinkRouter.json");
if (!fs.existsSync(artifactPath)) {
    console.error("❌ Artifact not found. Run: npx hardhat compile");
    process.exit(1);
}
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

async function main() {
    const RPC_URL     = process.env.PHAROS_RPC_URL || "https://atlantic.dplabs-internal.com";
    const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY!;

    if (!PRIVATE_KEY || PRIVATE_KEY === "0xYOUR_WALLET_PRIVATE_KEY_HERE") {
        console.error("❌ Set DEPLOYER_PRIVATE_KEY in contracts/.env");
        process.exit(1);
    }

    console.log("\n🚀 FaroLink — Direct ethers.js Deployment");
    console.log("━".repeat(55));
    console.log(`RPC:     ${RPC_URL}`);

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`Wallet:  ${wallet.address}`);

    // Get balance (with timeout fallback)
    let balance = "unknown";
    try {
        const bal = await Promise.race([
            provider.getBalance(wallet.address),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000))
        ]) as bigint;
        balance = ethers.formatEther(bal) + " PHRS";
        if (bal === 0n) {
            console.error("❌ Wallet has 0 PHRS — fund it at https://faucet.pharos.xyz");
            process.exit(1);
        }
    } catch {
        console.log("⚠️  Balance check timed out, proceeding anyway...");
    }
    console.log(`Balance: ${balance}`);

    // Deploy config
    const FEE_BPS       = 10;              // 0.10%
    const FEE_RECIPIENT = wallet.address;  // Fees go to deployer wallet initially

    console.log(`\nDeploying FaroLinkRouter (fee: ${FEE_BPS} bps → ${FEE_RECIPIENT})...`);

    const factory  = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    // Get gas price
    let gasPrice: bigint | undefined;
    try {
        const feeData = await provider.getFeeData();
        gasPrice = feeData.gasPrice ?? undefined;
        if (gasPrice) console.log(`Gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
    } catch {
        console.log("⚠️  Could not fetch gas price, using default");
    }

    const deployTx = await factory.deploy(FEE_BPS, FEE_RECIPIENT, {
        gasPrice,
        gasLimit: 1_180_000n,
    });

    console.log(`Tx sent:  ${deployTx.deploymentTransaction()?.hash}`);
    console.log("Waiting for confirmation...");

    await deployTx.waitForDeployment();
    const routerAddress = await deployTx.getAddress();

    console.log(`\n✅ FaroLinkRouter deployed!`);
    console.log(`   Address: ${routerAddress}`);
    console.log(`   Explorer: https://testnet.pharosscan.xyz/address/${routerAddress}`);

    // Save deployment info
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);

    const deploymentInfo = {
        network:    "pharos-atlantic",
        chainId:    688689,
        deployer:   wallet.address,
        deployedAt: new Date().toISOString(),
        rpc:        RPC_URL,
        contracts: {
            FaroLinkRouter: {
                address:      routerAddress,
                feeBps:       FEE_BPS,
                feeRecipient: FEE_RECIPIENT,
                txHash:       deployTx.deploymentTransaction()?.hash,
            }
        }
    };

    const outPath = path.join(deploymentsDir, "pharos-atlantic.json");
    fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));

    console.log(`\n📄 Deployment saved to: ${outPath}`);
    console.log("\n── Add to your service .env files ─────────────────────────");
    console.log(`PHAROS_FLOW_ROUTER_ADDRESS=${routerAddress}`);
    console.log("────────────────────────────────────────────────────────────\n");
}

main().catch(err => {
    console.error("\n❌ Deployment failed:", err.message);
    process.exit(1);
});
