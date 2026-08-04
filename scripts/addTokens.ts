import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();

  const airdropAddress = process.env.AIRDROP_ADDRESS!;
  const roundId = BigInt(process.env.ROUND_ID ?? "0");
  const amount = BigInt(process.env.AMOUNT!);

  if (!airdropAddress || !ethers.isAddress(airdropAddress)) {
    throw new Error("Missing or invalid AIRDROP_ADDRESS env value.");
  }
  if (!process.env.AMOUNT || amount <= 0n) {
    throw new Error("Missing or invalid AMOUNT env value.");
  }

  const airdrop = await ethers.getContractAt("Airdrop", airdropAddress, signer);
  const tokenAddress = await airdrop.token();
  const token = await ethers.getContractAt("IERC20", tokenAddress, signer);

  console.log(`Using signer: ${signer.address}`);
  console.log(`Adding ${amount} tokens to Airdrop ${airdropAddress}, round ${roundId} ...`);

  const approveTx = await token.approve(airdropAddress, amount);
  console.log("Approve tx sent:", approveTx.hash);
  await approveTx.wait();

  const tx = await airdrop.addTokens(roundId, amount);
  console.log("Add tokens tx sent:", tx.hash);

  const receipt = await tx.wait();
  console.log("Add tokens tx confirmed:", receipt?.hash);

  const round = await airdrop.rounds(roundId);
  console.log("New round totalSuppliedAmount:", round.totalSuppliedAmount.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
