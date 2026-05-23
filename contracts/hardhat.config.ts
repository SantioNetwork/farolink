import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.24",
        settings: {
            optimizer: { enabled: true, runs: 200 },
            evmVersion: "paris"
        },
    },
    networks: {
        // Pharos Testnet (Atlantic)
        pharos: {
            url:      process.env.PHAROS_RPC_URL || "https://atlantic.dplabs-internal.com",
            chainId:  688689,
            accounts: [DEPLOYER_KEY],
            gasPrice: "auto",
        },
        // Local Hardhat fork for quick testing
        localhost: {
            url:      "http://127.0.0.1:8545",
            chainId:  31337,
        },
    },
    paths: {
        sources:   "./contracts",
        tests:     "./test",
        artifacts: "./artifacts",
    },
};

export default config;
