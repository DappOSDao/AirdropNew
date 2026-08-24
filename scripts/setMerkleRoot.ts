import { ethers } from "hardhat";


async function main() {
  const [signer] = await ethers.getSigners();

  const airdropAddress = process.env.AIRDROP_ADDRESS!;
  const roundId = 2
  const merkleRootInput = "0x90e0e835544de21f93fda3d767b069c9120c2dba2b9eb52be65ef833538c1269";

  if (!airdropAddress || !ethers.isAddress(airdropAddress)) {
    throw new Error("Missing or invalid AIRDROP_ADDRESS env value.");
  }

  const merkleRoot = ethers.getBytes(merkleRootInput);
  const Airdrop = await ethers.getContractAt("Airdrop", airdropAddress, signer);
  console.log(`Using signer: ${signer.address}`);
  console.log(`Setting merkle root on Airdrop ${airdropAddress}, round ${roundId}, to ${merkleRootInput} ...`);

  const tx = await Airdrop.setMerkleRoot(roundId, merkleRoot);
  console.log("Tx sent:", tx.hash);

  const receipt = await tx.wait();
  console.log("Tx confirmed in block", receipt?.hash);

  const round = await Airdrop.rounds(roundId);
  console.log("New round merkleRoot on-chain:", round.merkleRoot);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
