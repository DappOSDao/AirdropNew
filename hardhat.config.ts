import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import 'hardhat-abi-exporter'
import "@nomicfoundation/hardhat-verify"
import * as dotenv from "dotenv";

dotenv.config();

const {
  ETH_RPC_URL,
  ARB_RPC_URL,
  DEPLOYER_PRIVATE_KEY,
  BASESCAN_API_KEY
}: NodeJS.ProcessEnv = process.env;

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    eth: {
      url: ETH_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    arb: {
      url: ARB_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  abiExporter: {
    path: './abi',
    runOnCompile: true,
    clear: true,
  },
  etherscan: {
    apiKey: BASESCAN_API_KEY,
  },
};


export default config;
