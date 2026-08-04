import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();

  const airdropAddress = process.env.AIRDROP_ADDRESS!;
  const merkleRootInput = process.env.MERKLE_ROOT!;
  const claimStartTimeInput = process.env.CLAIM_START_TIME;
  const claimEndTimeInput = process.env.CLAIM_END_TIME;
  const suppliedAmount = BigInt(process.env.SUPPLIED_AMOUNT ?? "0");
  const maxClaimPerAccountInput = process.env.MAX_CLAIM_PER_ACCOUNT;

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
  const claimStartTime = BigInt(claimStartTimeInput);
  const claimEndTime = BigInt(claimEndTimeInput);
  const maxClaimPerAccount = BigInt(maxClaimPerAccountInput);
  if (maxClaimPerAccount <= 0n) {
    throw new Error("MAX_CLAIM_PER_ACCOUNT must be greater than 0.");
  }

  const airdrop = await ethers.getContractAt("Airdrop", airdropAddress, signer);
  const tokenAddress = await airdrop.token();
  const token = await ethers.getContractAt("IERC20", tokenAddress, signer);

  console.log(`Using signer: ${signer.address}`);
  console.log(`Airdrop: ${airdropAddress}`);
  console.log(`Token: ${tokenAddress}`);
  console.log(`Creating round: root=${merkleRootInput}, start=${claimStartTime}, end=${claimEndTime}, supplied=${suppliedAmount}, maxClaimPerAccount=${maxClaimPerAccount}`);

  if (suppliedAmount > 0n) {
    const approveTx = await token.approve(airdropAddress, suppliedAmount);
    console.log("Approve tx sent:", approveTx.hash);
    await approveTx.wait();
  }

  const tx = await airdrop.createRound(
    ethers.getBytes(merkleRootInput),
    claimStartTime,
    claimEndTime,
    suppliedAmount,
    maxClaimPerAccount
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
