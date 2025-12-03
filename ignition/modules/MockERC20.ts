// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
npx hardhat ignition deploy ./ignition/modules/MockERC20.ts \
  --network $NETWORK
*/

/**
 * Hardhat Ignition deployment module for the MockERC20 contract.
 * Deploys a simple mintable ERC20 token for testing purposes.
 */
const MockERC20Module = buildModule("MockERC20Module", (m) => {
  const mockERC20 = m.contract("MockERC20", [], {
    id: "MockERC20",
  });

  return { mockERC20 };
});

export default MockERC20Module;

