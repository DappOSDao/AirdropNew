// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
npx hardhat ignition deploy ./ignition/modules/Airdrop.ts \
  --network $NETWORK \
  --parameters '{"AirdropModule":{"tokenAddress":"0x..."}}'
*/

/**
 * Hardhat Ignition deployment module for the Airdrop contract.
 * Exposes a configurable ERC20 token address so different environments can
 * supply their own values without changing this file.
 */
const AirdropModule = buildModule("AirdropModule", (m) => {
  const tokenAddress = m.getParameter<string>("tokenAddress");

  const airdrop = m.contract("Airdrop", [tokenAddress]);

  return { airdrop };
});

export default AirdropModule;
