import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun"
    }
  },
  networks: {
    pharosTestnet: {
        url: "https://atlantic.dplabs-internal.com",
        chainId: 688689,
        // @ts-ignore - Resolves strict HTTP/ZkSync toolkit type constraints
        type: "http",
        accounts: [] // Private keys loaded dynamically via execution env
    }
  }
};

export default config;
