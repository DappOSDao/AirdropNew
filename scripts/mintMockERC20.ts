import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();

  const tokenAddress = "0xeD575cf10A13925B8227449Ea4B9Ce824774300F";

  // 这里假设 Token 有 18 位小数
  const amount = ethers.parseUnits("10000", 18);

  const token = await ethers.getContractAt("MockERC20", tokenAddress, signer);

  console.log(`Using signer: ${signer.address}`);
  console.log(
    `Minting 10000 tokens (18 decimals) to Account ${signer.address} from token ${tokenAddress} ...`
  );

  const tx = await token.mint(signer.address, amount);
  console.log("Mint tx sent:", tx.hash);

  const receipt = await tx.wait();
  console.log("Mint tx confirmed in block", receipt?.hash);

  const balance = await token.balanceOf(signer.address);
  console.log("New Account's token balance:", balance.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


