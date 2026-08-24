import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();

  const airdropAddress = process.env.AIRDROP_ADDRESS!;
  const restakingAddress = process.env.RESTAKING_ADDRESS!;

  if (!airdropAddress || !ethers.isAddress(airdropAddress)) {
    throw new Error("Missing or invalid AIRDROP_ADDRESS env value.");
  }

  if (!restakingAddress || !ethers.isAddress(restakingAddress)) {
    throw new Error("Missing or invalid RESTAKING_ADDRESS env value. Use zero address to disable restaking.");
  }

  const airdrop = await ethers.getContractAt("Airdrop", airdropAddress, signer);

  console.log(`Using signer: ${signer.address}`);
  console.log(`Setting restaking on Airdrop ${airdropAddress} to ${restakingAddress} ...`);

  const tx = await airdrop.setRestaking(restakingAddress);
  console.log("Tx sent:", tx.hash);

  const receipt = await tx.wait();
  console.log("Tx confirmed in block", receipt?.blockNumber);

  const currentRestaking = await airdrop.restaking();
  console.log("New restaking on-chain:", currentRestaking);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
