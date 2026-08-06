import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();

  const airdropAddress = process.env.AIRDROP_ADDRESS!;
  const merkleRootInput = "0xf947377d57006d000f9017c610a02163ee0e559bddf13e0bb59ea26c5b5a00d5";
  const claimStartTimeInput = 1786007832;
  const claimEndTimeInput = 1786784485;
  const maxClaimPerAccountInput = "100000000000000000000"; //100

  if (!airdropAddress || !ethers.isAddress(airdropAddress)) {
    throw new Error("Missing or invalid AIRDROP_ADDRESS env value.");
  }
  if (!merkleRootInput) {
    throw new Error("Missing MERKLE_ROOT env value.");
  }
  if (!claimStartTimeInput) {
    throw new Error("Missing CLAIM_START_TIME env value.");
  }
  if (!claimEndTimeInput) {
    throw new Error("Missing CLAIM_END_TIME env value.");
  }
  if (!maxClaimPerAccountInput) {
    throw new Error("Missing MAX_CLAIM_PER_ACCOUNT env value.");
  }
  
  const airdrop = await ethers.getContractAt("Airdrop", airdropAddress, signer);
  const tokenAddress = await airdrop.token();

  console.log(`Using signer: ${signer.address}`);
  console.log(`Airdrop: ${airdropAddress}`);
  console.log(`Token: ${tokenAddress}`);
  console.log(`Creating round: root=${merkleRootInput}, start=${claimStartTimeInput}, end=${claimEndTimeInput}, maxClaimPerAccount=${maxClaimPerAccountInput}`);

  const tx = await airdrop.createRound(
    ethers.getBytes(merkleRootInput),
    claimStartTimeInput,
    claimEndTimeInput,
    maxClaimPerAccountInput
  );
  console.log("Create round tx sent:", tx.hash);

  const receipt = await tx.wait();
  console.log("Create round tx confirmed:", receipt?.hash);
  console.log("New round id:", ((await airdrop.roundCount()) - 1n).toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
