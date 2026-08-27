import { ethers } from "hardhat";

const OWNABLE_ABI = [
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner)",
  "function pendingOwner() public view returns (address)"
];

function resolveAddress(envName: string): string {
  const value = process.env[envName];

  if (!value) {
    throw new Error(`Missing ${envName}. Set it in .env or before running this script.`);
  }

  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid ${envName}: ${value}`);
  }

  return value;
}

async function main() {
  const [signer] = await ethers.getSigners();
  const ownableAddress = resolveAddress("OWNABLE_ADDRESS");
  const newOwner = resolveAddress("NEW_OWNER");

  const ownable = await ethers.getContractAt(OWNABLE_ABI, ownableAddress, signer);

  console.log(`Using signer: ${signer.address}`);
  console.log(`Ownable address: ${ownableAddress}`);

  const currentOwner = await ownable.owner();
  console.log(`Current owner: ${currentOwner}`);
  console.log(`Transferring ownership to: ${newOwner} ...`);

  const tx = await ownable.transferOwnership(newOwner);
  console.log("Tx sent:", tx.hash);

  const receipt = await tx.wait();
  console.log("Tx confirmed in block", receipt?.blockNumber);

  const updatedOwner = await ownable.owner();
  console.log("New owner on-chain:", updatedOwner);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
