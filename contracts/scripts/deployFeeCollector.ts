import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "FeeCollector.sol", "FeeCollector.json");
if (!fs.existsSync(artifactPath)) {
    console.error("❌ Artifact not found. Run: npx hardhat compile");
    process.exit(1);
}
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

async function main() {
    const RPC_URL = process.env.PHAROS_RPC_URL || "https://atlantic.dplabs-internal.com";
    const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY!;

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`\nDeploying FeeCollector to ${RPC_URL}...`);

    // FeeCollector constructor expects (address initialOwner)
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    let gasPrice: bigint | undefined;
    try {
        const feeData = await provider.getFeeData();
        gasPrice = feeData.gasPrice ?? undefined;
    } catch { }

    const deployTx = await factory.deploy({
        gasPrice,
        gasLimit: 2_000_000n,
    });

    console.log(`Tx sent:  ${deployTx.deploymentTransaction()?.hash}`);
    await deployTx.waitForDeployment();
    const collectorAddress = await deployTx.getAddress();

    console.log(`\n✅ FeeCollector deployed!`);
    console.log(`   Address: ${collectorAddress}`);
    console.log(`   Explorer: https://atlantic.pharosscan.xyz/address/${collectorAddress}`);
}

main().catch(err => {
    console.error("\n❌ Deployment failed:", err.message);
    process.exit(1);
});
