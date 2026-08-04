import { ethers } from "hardhat";

/**
 * 需要查询的用户地址：按需改成目标钱包地址，或通过 WALLET_ADDRESS 环境变量传入。
 * Airdrop 合约地址仍沿用项目其它脚本的 AIRDROP_ADDRESS 环境变量。
 * 期数通过 ROUND_ID 环境变量传入，默认查询第 0 期。
 */
const walletAddress = process.env.WALLET_ADDRESS ?? "0x63EBf63acD5310252bA7218AD7236218EAc05dd0";
const roundId = BigInt(process.env.ROUND_ID ?? "0");

function formatTimestamp(timestamp: bigint): string {
  if (timestamp === 0n) {
    return "0 (not set)";
  }

  return `${timestamp.toString()} (${new Date(Number(timestamp) * 1000).toISOString()})`;
}

async function main() {
  const [signer] = await ethers.getSigners();
  const airdropAddress = process.env.AIRDROP_ADDRESS!;

  if (!airdropAddress || !ethers.isAddress(airdropAddress)) {
    throw new Error("Missing or invalid AIRDROP_ADDRESS env value.");
  }

  if (!ethers.isAddress(walletAddress)) {
    throw new Error(`Invalid walletAddress: ${walletAddress}`);
  }

  const network = await signer.provider.getNetwork();
  const airdrop = await ethers.getContractAt("Airdrop", airdropAddress, signer);

  const tokenAddress = await airdrop.token();
  const token = await ethers.getContractAt("IERC20", tokenAddress, signer);

  const [
    owner,
    paused,
    roundCount,
    round,
    claimTimeStatus,
    hasClaimed,
    airdropTokenBalance,
  ] = await Promise.all([
    airdrop.owner(),
    airdrop.paused(),
    airdrop.roundCount(),
    airdrop.rounds(roundId),
    airdrop.getClaimTimeStatus(roundId),
    airdrop.hasClaimed(roundId, walletAddress),
    token.balanceOf(airdropAddress),
  ]);

  console.log("=== Airdrop Status ===");
  console.log(`Network: chainId=${network.chainId.toString()} (${network.name})`);
  console.log(`Signer: ${signer.address}`);
  console.log(`Airdrop: ${airdropAddress}`);
  console.log(`Token: ${tokenAddress}`);
  console.log(`Owner: ${owner}`);
  console.log(`Paused: ${paused}`);
  console.log(`Round count: ${roundCount.toString()}`);
  console.log(`Round ID: ${roundId.toString()}`);
  console.log(`Round exists: ${round.exists}`);
  console.log(`Merkle root: ${round.merkleRoot}`);
  console.log(`Claim start time: ${formatTimestamp(round.claimStartTime)}`);
  console.log(`Claim end time: ${formatTimestamp(round.claimEndTime)}`);
  console.log(`Has started: ${claimTimeStatus.hasStarted}`);
  console.log(`Start time remaining: ${claimTimeStatus.startTimeRemaining.toString()} seconds`);
  console.log(`Has ended: ${claimTimeStatus.hasEnded}`);
  console.log(`End time remaining: ${claimTimeStatus.endTimeRemaining.toString()} seconds`);
  console.log(`Is claim window open: ${claimTimeStatus.hasStarted && !claimTimeStatus.hasEnded}`);
  console.log(`Total supplied amount: ${round.totalSuppliedAmount.toString()}`);
  console.log(`Max claim per account: ${round.maxClaimPerAccount.toString()}`);
  console.log(`Total claimed count: ${round.totalClaimedCount.toString()}`);
  console.log(`Total claimed amount: ${round.totalClaimedAmount.toString()}`);
  console.log(`Round unclaimed amount: ${(round.totalSuppliedAmount - round.totalClaimedAmount).toString()}`);
  console.log(`Airdrop token balance: ${airdropTokenBalance.toString()}`);

  console.log("\n=== Wallet Query ===");
  console.log(`Wallet: ${walletAddress}`);
  console.log(`Has claimed this round: ${hasClaimed}`);
  console.log(`Is owner: ${walletAddress.toLowerCase() === owner.toLowerCase()}`);

  console.log("\n=== Owner-only Airdrop Infos ===");
  try {
    const info = await airdrop.getAirdropInfos(roundId);
    const infoRound = info.round;
    console.log(`Total claimed count: ${infoRound.totalClaimedCount.toString()}`);
    console.log(`Total claimed amount: ${infoRound.totalClaimedAmount.toString()}`);
    console.log(`Total supplied amount: ${infoRound.totalSuppliedAmount.toString()}`);
    console.log(`Unclaimed amount: ${(infoRound.totalSuppliedAmount - infoRound.totalClaimedAmount).toString()}`);
    console.log(`Max claim per account: ${infoRound.maxClaimPerAccount.toString()}`);
    console.log(`Contract token balance: ${info.contractBalance.toString()}`);
    console.log(`Info merkle root: ${infoRound.merkleRoot}`);
    console.log(`Info claim start time: ${formatTimestamp(infoRound.claimStartTime)}`);
    console.log(`Info claim end time: ${formatTimestamp(infoRound.claimEndTime)}`);
    console.log(`Info is claimable: ${claimTimeStatus.hasStarted && !claimTimeStatus.hasEnded}`);
  } catch (error) {
    console.log("Skipped: getAirdropInfos(roundId) is onlyOwner, current signer is not owner or call failed.");
  }

  console.log("\nNote: checkEligibility(roundId, wallet, amount, proof) 还需要 amount 和 merkle proof，无法仅凭地址查询。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
