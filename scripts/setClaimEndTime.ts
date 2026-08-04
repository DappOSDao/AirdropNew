import { ethers } from "hardhat";

function getRoundId(): bigint {
  return BigInt(process.env.ROUND_ID ?? "0");
}

async function main() {
  const [signer] = await ethers.getSigners();

  const airdropAddress = process.env.AIRDROP_ADDRESS!;
  const roundId = getRoundId();
  const claimEndTime = BigInt(process.env.CLAIM_END_TIME ?? "1785600000");

  if (!airdropAddress || !ethers.isAddress(airdropAddress)) {
    throw new Error("Missing or invalid AIRDROP_ADDRESS env value.");
  }

  const Airdrop = await ethers.getContractAt("Airdrop", airdropAddress, signer);

  console.log(`Using signer: ${signer.address}`);
  console.log(
    `Setting claimEndTime on Airdrop ${airdropAddress}, round ${roundId}, to ${claimEndTime} ...`
  );

  const tx = await Airdrop.setClaimEndTime(roundId, claimEndTime);
  console.log("Tx sent:", tx.hash);

  const receipt = await tx.wait();
  console.log("Tx confirmed in block", receipt?.hash);

  const round = await Airdrop.rounds(roundId);
  console.log("New round claimEndTime on-chain:", round.claimEndTime.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
