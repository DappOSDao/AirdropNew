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
    await token.mint(owner.address, totalAllocation);
    await token.transfer(airdrop.target, totalAllocation);

    const deadline = (await time.latest()) + 3600;
    await airdrop.setMerkleRoot(tree.root);
    await airdrop.setClaimEndTime(deadline);

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
      deadline,
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
    const { airdrop, token, alice, claims, tree, leaves } = await loadFixture(
      deployFixture
    );
    const amount = claims.find(([wallet]) => wallet === alice.address)![1];
    const proof = proofFor(tree, leaves, alice.address, amount);

    await expect(airdrop.connect(alice).claim(amount, proof))
      .to.emit(airdrop, "Claimed")
      .withArgs(alice.address, amount);

    expect(await token.balanceOf(alice.address)).to.equal(amount);
  });

  it("blocks repeated claims from the same wallet", async function () {
    const { airdrop, alice, claims, tree, leaves } = await loadFixture(
      deployFixture
    );
    const amount = claims.find(([wallet]) => wallet === alice.address)![1];
    const proof = proofFor(tree, leaves, alice.address, amount);

    await airdrop.connect(alice).claim(amount, proof);

    await expect(
      airdrop.connect(alice).claim(amount, proof)
    ).to.be.revertedWith("Already claimed");
  });

  it("rejects mismatched proofs even if the amount is valid", async function () {
    const { airdrop, bob, claims, tree, leaves } = await loadFixture(
      deployFixture
    );
    const amount = claims.find(([wallet]) => wallet === bob.address)![1];
    const wrongProof = proofFor(tree, leaves, claims[0][0], claims[0][1]);

    await expect(
      airdrop.connect(bob).claim(amount, wrongProof)
    ).to.be.revertedWith("Invalid proof");
  });

  it("prevents claims after the deadline and lets owner withdraw leftovers", async function () {
    const { airdrop, owner, alice, token, claims, tree, leaves, deadline } =
      await loadFixture(deployFixture);

    await time.increaseTo(deadline + 1);

    const amount = claims.find(([wallet]) => wallet === alice.address)![1];
    const proof = proofFor(tree, leaves, alice.address, amount);

    await expect(
      airdrop.connect(alice).claim(amount, proof)
    ).to.be.revertedWith("Deadline elapsed");

    const balanceBefore = await token.balanceOf(airdrop.target);
    await expect(airdrop.connect(owner).withdraw(balanceBefore))
      .to.emit(airdrop, "Withdrawn")
      .withArgs(owner.address, balanceBefore);

    expect(await token.balanceOf(owner.address)).to.equal(balanceBefore);
  });

  it("exposes accurate eligibility info", async function () {
    const { airdrop, alice, outsider, claims, tree, leaves } =
      await loadFixture(deployFixture);

    const amount = claims.find(([wallet]) => wallet === alice.address)![1];
    const proof = proofFor(tree, leaves, alice.address, amount);
    const [isEligible, canClaim] = await airdrop.checkEligibility(
      alice.address,
      amount,
      proof
    );

    expect(isEligible).to.be.true;
    expect(canClaim).to.be.true;

    const outsiderProof = proofFor(tree, leaves, claims[0][0], claims[0][1]);
    const [isEligibleOutsider] = await airdrop.checkEligibility(
      outsider.address,
      amount,
      outsiderProof
    );

    expect(isEligibleOutsider).to.be.false;
  });
});

