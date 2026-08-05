// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title Airdrop
/// @notice Supports multiple ERC20 airdrop rounds in one contract. Each round has
///         an independent Merkle root, claim deadline and claimed state.
contract Airdrop is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /// @notice ERC20 token distributed by all rounds in this contract.
    IERC20 public immutable token;

    struct Round {
        bytes32 merkleRoot;
        uint256 claimStartTime;
        uint256 claimEndTime;
        uint256 maxClaimPerAccount;
        bool exists;
    }

    /// @notice Number of rounds created so far. Round ids are [0, roundCount).
    uint256 public roundCount;

    /// @notice roundId => round config.
    mapping(uint256 => Round) public rounds;

    /// @notice roundId => wallet => claimed.
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    event RoundCreated(
        uint256 indexed roundId,
        bytes32 indexed merkleRoot,
        uint256 claimStartTime,
        uint256 claimEndTime,
        uint256 maxClaimPerAccount
    );
    event MerkleRootSet(uint256 indexed roundId, bytes32 indexed root);
    /// @notice Initialize the contract and bind the ERC20 that will be distributed.
    /// @param tokenAddr ERC20 token distributed by this contract.
    constructor(address tokenAddr) Ownable(msg.sender) {
        require(tokenAddr != address(0), "Invalid token address");
        token = IERC20(tokenAddr);
    }

    modifier roundExists(uint256 roundId) {
        require(rounds[roundId].exists, "Round not found");
        _;
    }

    /// @notice Create a new airdrop round.
    /// @param merkleRoot Merkle root for leaves keccak256(abi.encodePacked(wallet, amount)).
    /// @param claimStartTime Claim start timestamp.
    /// @param claimEndTime Claim deadline timestamp.
    /// @param maxClaimPerAccount Maximum amount a single account can claim in this round.
    /// @return roundId Newly created round id.
    function createRound(
        bytes32 merkleRoot,
        uint256 claimStartTime,
        uint256 claimEndTime,
        uint256 maxClaimPerAccount
    ) external onlyOwner nonReentrant returns (uint256 roundId) {
        require(merkleRoot != bytes32(0), "Invalid merkle root");
        require(
            claimStartTime > block.timestamp && claimEndTime > claimStartTime,
            "Invalid claim time"
        );
        require(maxClaimPerAccount > 0, "Invalid max claim");

        roundId = roundCount;
        roundCount++;

        rounds[roundId] = Round({
            merkleRoot: merkleRoot,
            claimStartTime: claimStartTime,
            claimEndTime: claimEndTime,
            maxClaimPerAccount: maxClaimPerAccount,
            exists: true
        });

        emit RoundCreated(
            roundId,
            merkleRoot,
            claimStartTime,
            claimEndTime,
            maxClaimPerAccount
        );
    }

    /// @notice Update a round Merkle root.
    /// @param roundId Target round id.
    /// @param merkleRoot New packed wallet+amount Merkle root.
    function setMerkleRoot(
        uint256 roundId,
        bytes32 merkleRoot
    ) external onlyOwner roundExists(roundId) {
        require(merkleRoot != bytes32(0), "Invalid merkle root");
        rounds[roundId].merkleRoot = merkleRoot;

        emit MerkleRootSet(roundId, merkleRoot);
    }

    /// @notice Claim tokens pre-allocated in one round's Merkle tree.
    /// @param roundId Target round id.
    /// @param amount Exact amount encoded for the caller.
    /// @param proof Merkle branch that proves inclusion.
    function claim(
        uint256 roundId,
        uint256 amount,
        bytes32[] calldata proof
    ) external whenNotPaused nonReentrant roundExists(roundId) {
        Round storage round = rounds[roundId];

        require(
            block.timestamp >= round.claimStartTime &&
                block.timestamp < round.claimEndTime,
            "Invalid claim time"
        );
        require(!hasClaimed[roundId][msg.sender], "Already claimed");
        require(
            amount > 0 && amount <= round.maxClaimPerAccount,
            "Invalid claim amount"
        );
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        bool isValidProof = MerkleProof.verify(proof, round.merkleRoot, leaf);
        require(isValidProof, "Invalid proof");

        hasClaimed[roundId][msg.sender] = true;

        token.safeTransfer(msg.sender, amount);
    }

    /// @notice View helper to check a proof and operational constraints for a round.
    /// @param roundId Target round id.
    /// @param wallet Address to inspect.
    /// @param amount Amount linked to `wallet` in the tree.
    /// @param proof Merkle branch to validate.
    /// @return isEligible True if the branch matches the round root.
    /// @return canClaim True if the wallet can still claim this round right now.
    /// @return claimed True if the wallet has already claimed this round.
    function checkEligibility(
        uint256 roundId,
        address wallet,
        uint256 amount,
        bytes32[] calldata proof
    )
        external
        view
        roundExists(roundId)
        returns (bool isEligible, bool canClaim, bool claimed)
    {
        Round storage round = rounds[roundId];
        bytes32 leaf = keccak256(abi.encodePacked(wallet, amount));
        isEligible = MerkleProof.verify(proof, round.merkleRoot, leaf);
        claimed = hasClaimed[roundId][wallet];

        canClaim =
            isEligible &&
            !claimed &&
            block.timestamp >= round.claimStartTime &&
            block.timestamp < round.claimEndTime &&
            amount > 0 &&
            amount <= round.maxClaimPerAccount &&
            !paused() &&
            amount <= token.balanceOf(address(this));
    }

    /// @notice Recover tokens held by the contract.
    /// @param to Receiver of leftover tokens.
    function withdraw(
        address to,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid receiver");
        uint256 balance = token.balanceOf(address(this));
        if (amount > balance) {
            amount = balance;
        }
        token.safeTransfer(to, amount);
    }

    /// @notice Pause claiming (emergencies only).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume claiming after being paused.
    function unpause() external onlyOwner {
        _unpause();
    }
}
