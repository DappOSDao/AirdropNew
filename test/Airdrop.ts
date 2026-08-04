import { expect } from "chai";
import { ethers } from "hardhat";
import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { SimpleMerkleTree } from "@openzeppelin/merkle-tree";

import type { Airdrop, MockERC20 } from "../typechain-types";

type ClaimEntry = [string, bigint];

describe("Airdrop", function () {
  async function deployFixture() {
    const [owner, alice, bob, carol, outsider] = await ethers.getSigners();

    const claims: ClaimEntry[] = [
      [alice.address, ethers.parseEther("100")],
      [bob.address, ethers.parseEther("50")],
      [carol.address, ethers.parseEther("25")],
    ];

    const leaves = claims.map(([addr, amount]) =>
      ethers.solidityPackedKeccak256(["address", "uint256"], [addr, amount])
    );
    const tree = SimpleMerkleTree.of(leaves);

    const token = (await ethers.deployContract("MockERC20")) as MockERC20;
    await token.waitForDeployment();

    const airdrop = (await ethers.deployContract("Airdrop", [
      token.target,
    ])) as Airdrop;
    await airdrop.waitForDeployment();

    const totalAllocation = claims.reduce((sum, [, amount]) => sum + amount, 0n);
    await token.mint(owner.address, totalAllocation * 2n);
    await token.approve(airdrop.target, totalAllocation * 2n);

    const startTime = (await time.latest()) + 60;
    const deadline = startTime + 3600;
    const maxClaimPerAccount = ethers.parseEther("100");
    const tx = await airdrop.createRound(
      tree.root,
      startTime,
      deadline,
      totalAllocation,
      maxClaimPerAccount
    );
    await tx.wait();
    const roundId = 0n;

    return {
      owner,
      alice,
      bob,
      carol,
      outsider,
      token,
      airdrop,
      claims,
      tree,
      leaves,
      startTime,
      deadline,
      totalAllocation,
      maxClaimPerAccount,
      roundId,
    };
  }

  const proofFor = (
    tree: SimpleMerkleTree,
    leaves: string[],
    addr: string,
    amount: bigint
  ): string[] => {
    const leaf = ethers.solidityPackedKeccak256(
      ["address", "uint256"],
      [addr, amount]
    );
    const index = leaves.findIndex(value => value === leaf);
    if (index === -1) {
      throw new Error("address missing from tree");
    }
    return tree.getProof(index);
  };

  it("allows claimers to withdraw the exact allocation once", async function () {
    const { airdrop, token, alice, claims, tree, leaves, startTime, roundId } = await loadFixture(
      deployFixture
    );
    const amount = claims.find(([wallet]) => wallet === alice.address)![1];
    const proof = proofFor(tree, leaves, alice.address, amount);
    await time.increaseTo(startTime);

    await expect(airdrop.connect(alice).claim(roundId, amount, proof))
      .to.emit(airdrop, "Claimed")
      .withArgs(roundId, alice.address, amount);

    expect(await token.balanceOf(alice.address)).to.equal(amount);
  });

  it("blocks repeated claims from the same wallet in the same round", async function () {
    const { airdrop, alice, claims, tree, leaves, startTime, roundId } = await loadFixture(
      deployFixture
    );
    const amount = claims.find(([wallet]) => wallet === alice.address)![1];
    const proof = proofFor(tree, leaves, alice.address, amount);
    await time.increaseTo(startTime);

    await airdrop.connect(alice).claim(roundId, amount, proof);

    await expect(
      airdrop.connect(alice).claim(roundId, amount, proof)
    ).to.be.revertedWith("Already claimed");
  });

  it("supports multiple rounds with independent claimed state", async function () {
    const { airdrop, token, alice, claims, tree, leaves, startTime, deadline } =
      await loadFixture(deployFixture);
    const amount = claims.find(([wallet]) => wallet === alice.address)![1];
    const proof = proofFor(tree, leaves, alice.address, amount);

    const secondRoundAmount = claims.reduce((sum, [, value]) => sum + value, 0n);
    const secondStartTime = startTime + 1;
    await airdrop.createRound(
      tree.root,
      secondStartTime,
      deadline + 3600,
      secondRoundAmount,
      amount
    );

    await time.increaseTo(secondStartTime);

    await airdrop.connect(alice).claim(0, amount, proof);
    await airdrop.connect(alice).claim(1, amount, proof);

    expect(await token.balanceOf(alice.address)).to.equal(amount * 2n);
    expect(await airdrop.hasClaimed(0, alice.address)).to.equal(true);
    expect(await airdrop.hasClaimed(1, alice.address)).to.equal(true);
  });

  it("prevents claims before the round start time", async function () {
    const { airdrop, alice, claims, tree, leaves, roundId } = await loadFixture(
      deployFixture
    );
    const amount = claims.find(([wallet]) => wallet === alice.address)![1];
    const proof = proofFor(tree, leaves, alice.address, amount);

    await expect(
      airdrop.connect(alice).claim(roundId, amount, proof)
    ).to.be.revertedWith("Invalid claim time");

    const [, canClaim] = await airdrop.checkEligibility(
      roundId,
      alice.address,
      amount,
      proof
    );
    expect(canClaim).to.be.false;
  });

  it("rejects invalid round start and end times", async function () {
    const { airdrop, tree, startTime, deadline, totalAllocation, maxClaimPerAccount } =
      await loadFixture(deployFixture);

    await expect(
      airdrop.createRound(tree.root, startTime - 120, deadline, totalAllocation, maxClaimPerAccount)
    ).to.be.revertedWith("Invalid claim time");

    await expect(
      airdrop.createRound(tree.root, deadline + 1, deadline, totalAllocation, maxClaimPerAccount)
    ).to.be.revertedWith("Invalid claim time");
  });

  it("rejects claims above the round max even with a valid proof", async function () {
    const { owner, token, airdrop, alice } = await loadFixture(deployFixture);
    const excessiveAmount = ethers.parseEther("101");
    const maxClaimPerAccount = ethers.parseEther("100");
    const leaves = [
      ethers.solidityPackedKeccak256(
        ["address", "uint256"],
        [alice.address, excessiveAmount]
      ),
    ];
    const tree = SimpleMerkleTree.of(leaves);
    const startTime = (await time.latest()) + 60;
    const deadline = startTime + 3600;

    await token.mint(owner.address, excessiveAmount);
    await token.approve(airdrop.target, excessiveAmount);
    await airdrop.createRound(
      tree.root,
      startTime,
      deadline,
      excessiveAmount,
      maxClaimPerAccount
    );

    await time.increaseTo(startTime);

    await expect(
      airdrop.connect(alice).claim(1, excessiveAmount, tree.getProof(0))
    ).to.be.revertedWith("Invalid claim amount");

    const [, canClaim] = await airdrop.checkEligibility(
      1,
      alice.address,
      excessiveAmount,
      tree.getProof(0)
    );
    expect(canClaim).to.be.false;
  });

  it("rejects creating a round with zero max claim per account", async function () {
    const { airdrop, tree, deadline, totalAllocation } = await loadFixture(
      deployFixture
    );

    await expect(
      airdrop.createRound(tree.root, deadline + 1, deadline + 3600, totalAllocation, 0)
    ).to.be.revertedWith("Invalid max claim");
  });

  it("lets owner update max claim per account", async function () {
    const { airdrop, owner, alice, outsider, claims, tree, leaves, startTime, roundId } =
      await loadFixture(deployFixture);
    const amount = claims.find(([wallet]) => wallet === alice.address)![1];
    const proof = proofFor(tree, leaves, alice.address, amount);
    const loweredMax = amount - 1n;

    await expect(airdrop.connect(owner).setMaxClaimPerAccount(roundId, loweredMax))
      .to.emit(airdrop, "MaxClaimPerAccountSet")
      .withArgs(roundId, loweredMax);

    await time.increaseTo(startTime);

    await expect(
      airdrop.connect(alice).claim(roundId, amount, proof)
    ).to.be.revertedWith("Invalid claim amount");

    await expect(
      airdrop.connect(outsider).setMaxClaimPerAccount(roundId, amount)
    ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");

    await expect(
      airdrop.connect(owner).setMaxClaimPerAccount(roundId, 0)
    ).to.be.revertedWith("Invalid max claim");
  });

  it("rejects mismatched proofs even if the amount is valid", async function () {
    const { airdrop, bob, claims, tree, leaves, startTime, roundId } = await loadFixture(
      deployFixture
    );
    const amount = claims.find(([wallet]) => wallet === bob.address)![1];
    const wrongProof = proofFor(tree, leaves, claims[0][0], claims[0][1]);
    await time.increaseTo(startTime);

    await expect(
      airdrop.connect(bob).claim(roundId, amount, wrongProof)
    ).to.be.revertedWith("Invalid proof");
  });

  it("lets owner withdraw round leftovers before the deadline", async function () {
    const { airdrop, owner, token, roundId, totalAllocation } =
      await loadFixture(deployFixture);

    const ownerBefore = await token.balanceOf(owner.address);
    await expect(airdrop.connect(owner).withdraw(roundId, owner.address))
      .to.emit(airdrop, "Withdrawn")
      .withArgs(roundId, owner.address, totalAllocation);

    expect(await token.balanceOf(owner.address)).to.equal(ownerBefore + totalAllocation);
  });

  it("prevents claims after the deadline and lets owner withdraw round leftovers", async function () {
    const { airdrop, owner, alice, token, claims, tree, leaves, deadline, roundId, totalAllocation } =
      await loadFixture(deployFixture);

    await time.increaseTo(deadline + 1);

    const amount = claims.find(([wallet]) => wallet === alice.address)![1];
    const proof = proofFor(tree, leaves, alice.address, amount);

    await expect(
      airdrop.connect(alice).claim(roundId, amount, proof)
    ).to.be.revertedWith("Invalid claim time");

    const ownerBefore = await token.balanceOf(owner.address);
    await expect(airdrop.connect(owner).withdraw(roundId, owner.address))
      .to.emit(airdrop, "Withdrawn")
      .withArgs(roundId, owner.address, totalAllocation);

    expect(await token.balanceOf(owner.address)).to.equal(ownerBefore + totalAllocation);
  });

  it("exposes accurate eligibility info", async function () {
    const { airdrop, alice, outsider, claims, tree, leaves, startTime, roundId } =
      await loadFixture(deployFixture);

    const amount = claims.find(([wallet]) => wallet === alice.address)![1];
    const proof = proofFor(tree, leaves, alice.address, amount);
    await time.increaseTo(startTime);
    const [isEligible, canClaim] = await airdrop.checkEligibility(
      roundId,
      alice.address,
      amount,
      proof
    );

    expect(isEligible).to.be.true;
    expect(canClaim).to.be.true;

    const outsiderProof = proofFor(tree, leaves, claims[0][0], claims[0][1]);
    const [isEligibleOutsider] = await airdrop.checkEligibility(
      roundId,
      outsider.address,
      amount,
      outsiderProof
    );

    expect(isEligibleOutsider).to.be.false;
  });
});
