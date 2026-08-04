import { ethers } from "hardhat";

function resolveTokenAddress(): string {
  const tokenAddress = process.env.TOKEN_ADDRESS;

  if (!tokenAddress) {
    throw new Error("Missing token address. Use --token or env AIRDROP_TOKEN_ADDRESS/TOKEN_ADDRESS.");
  }

  if (!ethers.isAddress(tokenAddress)) {
    throw new Error(`Invalid token address: ${tokenAddress}`);
  }

  return tokenAddress;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const tokenAddress = resolveTokenAddress();

  const network = await deployer.provider?.getNetwork();
  console.log(`Using deployer: ${deployer.address}`);
  console.log(
    `Network: chainId=${network?.chainId?.toString() ?? "unknown"} (${network?.name ?? "unknown"})`
  );
  console.log(`Deploying Airdrop with token=${tokenAddress} ...`);

  const Airdrop = await ethers.getContractFactory("Airdrop", deployer);
  const airdrop = await Airdrop.deploy(tokenAddress);
  console.log("Deployment tx:", airdrop.deploymentTransaction()?.hash);

  await airdrop.waitForDeployment();
  const airdropAddress = await airdrop.getAddress();
  console.log(`Airdrop deployed at: ${airdropAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

