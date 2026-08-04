import { ethers } from "hardhat";

function getRoundId(): bigint {
  return BigInt(process.env.ROUND_ID ?? "0");
}

async function main() {
  const [signer] = await ethers.getSigners();

  const airdropAddress = process.env.AIRDROP_ADDRESS!;
  const roundId = getRoundId();
  const merkleRootInput = process.env.MERKLE_ROOT ?? "0x8ed5d108764ebbf72356e845af769e2bef7b6511809fbad87047d518f2fa8770";

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
