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
///         an independent Merkle root, claim deadline, funding amount and claimed state.
contract Airdrop is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /// @notice ERC20 token distributed by all rounds in this contract.
    IERC20 public immutable token;

    struct Round {
        bytes32 merkleRoot;
        uint256 claimStartTime;
        uint256 claimEndTime;
        uint256 totalSuppliedAmount;
        uint256 totalClaimedAmount;
        uint256 maxClaimPerAccount;
        uint256 totalClaimedCount;
        bool exists;
    }

    /// @notice Number of rounds created so far. Round ids are [0, roundCount).
    uint256 public roundCount;

    /// @notice roundId => round config and aggregate accounting.
    mapping(uint256 => Round) public rounds;

    /// @notice roundId => wallet => claimed.
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    event RoundCreated(
        uint256 indexed roundId,
        bytes32 indexed merkleRoot,
        uint256 claimStartTime,
        uint256 claimEndTime,
        uint256 suppliedAmount,
        uint256 maxClaimPerAccount
    );
    event MerkleRootSet(uint256 indexed roundId, bytes32 indexed root);
    event Claimed(
        uint256 indexed roundId,
        address indexed addr,
        uint256 amount
    );
    event ClaimStartTimeSet(uint256 indexed roundId, uint256 newStartTime);
    event ClaimEndTimeSet(uint256 indexed roundId, uint256 newEndTime);
    event MaxClaimPerAccountSet(
        uint256 indexed roundId,
        uint256 maxClaimPerAccount
    );
    event TokensAdded(uint256 indexed roundId, uint256 amount);
    event Withdrawn(
        uint256 indexed roundId,
        address indexed addr,
        uint256 amount
    );

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

    /// @notice Create a new airdrop round and optionally fund it in the same tx.
    /// @dev Caller must approve this contract for `suppliedAmount` before calling.
    /// @param merkleRoot Merkle root for leaves keccak256(abi.encodePacked(wallet, amount)).
    /// @param claimStartTime Claim start timestamp.
    /// @param claimEndTime Claim deadline timestamp.
    /// @param suppliedAmount Initial token amount assigned to this round.
    /// @param maxClaimPerAccount Maximum amount a single account can claim in this round.
    /// @return roundId Newly created round id.
    function createRound(
        bytes32 merkleRoot,
        uint256 claimStartTime,
        uint256 claimEndTime,
        uint256 suppliedAmount,
        uint256 maxClaimPerAccount
    ) external onlyOwner nonReentrant returns (uint256 roundId) {
        require(merkleRoot != bytes32(0), "Invalid merkle root");
        require(
            claimStartTime > block.timestamp && claimEndTime > claimStartTime,
            "Invalid claim time"
        );
        require(suppliedAmount > 0, "Invalid supplied amount");
        require(maxClaimPerAccount > 0, "Invalid max claim");

        roundId = roundCount;
        roundCount++;

        rounds[roundId] = Round({
            merkleRoot: merkleRoot,
            claimStartTime: claimStartTime,
            claimEndTime: claimEndTime,
            totalSuppliedAmount: suppliedAmount,
            totalClaimedAmount: 0,
            maxClaimPerAccount: maxClaimPerAccount,
            totalClaimedCount: 0,
            exists: true
        });

        token.safeTransferFrom(msg.sender, address(this), suppliedAmount);

        emit RoundCreated(
            roundId,
            merkleRoot,
            claimStartTime,
            claimEndTime,
            suppliedAmount,
            maxClaimPerAccount
        );
    }

    /// @notice Add more tokens to an existing round.
    /// @dev Caller must approve this contract for `amount` before calling.
    function addTokens(
        uint256 roundId,
        uint256 amount
    ) external onlyOwner nonReentrant roundExists(roundId) {
        require(amount > 0, "Invalid amount");

        rounds[roundId].totalSuppliedAmount += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);

        emit TokensAdded(roundId, amount);
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

    /// @notice Update a round claim start time without touching the root.
    /// @param roundId Target round id.
    /// @param claimStartTime Replacement timestamp for the round start time.
    function setClaimStartTime(
        uint256 roundId,
        uint256 claimStartTime
    ) external onlyOwner roundExists(roundId) {
        Round storage round = rounds[roundId];
        require(claimStartTime < round.claimEndTime, "Invalid start time");
        round.claimStartTime = claimStartTime;

        emit ClaimStartTimeSet(roundId, claimStartTime);
    }

    /// @notice Extend or shorten a round claim deadline without touching the root.
    /// @param roundId Target round id.
    /// @param claimEndTime Replacement timestamp for the round deadline.
    function setClaimEndTime(
        uint256 roundId,
        uint256 claimEndTime
    ) external onlyOwner roundExists(roundId) {
        Round storage round = rounds[roundId];
        require(claimEndTime > round.claimStartTime, "Invalid end time");
        round.claimEndTime = claimEndTime;

        emit ClaimEndTimeSet(roundId, claimEndTime);
    }

    /// @notice Update a round's per-account maximum claim amount.
    /// @param roundId Target round id.
    /// @param maxClaimPerAccount New maximum amount a single account can claim.
    function setMaxClaimPerAccount(
        uint256 roundId,
        uint256 maxClaimPerAccount
    ) external onlyOwner roundExists(roundId) {
        require(maxClaimPerAccount > 0, "Invalid max claim");
        rounds[roundId].maxClaimPerAccount = maxClaimPerAccount;

        emit MaxClaimPerAccountSet(roundId, maxClaimPerAccount);
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
        require(
            round.totalClaimedAmount + amount <= round.totalSuppliedAmount &&
                amount <= token.balanceOf(address(this)),
            "Insufficient balance"
        );

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        bool isValidProof = MerkleProof.verify(proof, round.merkleRoot, leaf);
        require(isValidProof, "Invalid proof");

        hasClaimed[roundId][msg.sender] = true;
        round.totalClaimedCount++;
        round.totalClaimedAmount += amount;

        token.safeTransfer(msg.sender, amount);

        emit Claimed(roundId, msg.sender, amount);
    }

    /// @notice View helper to check a proof and operational constraints for a round.
    /// @param roundId Target round id.
    /// @param wallet Address to inspect.
    /// @param amount Amount linked to `wallet` in the tree.
    /// @param proof Merkle branch to validate.
    /// @return isEligible True if the branch matches the round root.
    /// @return canClaim True if the wallet can still claim this round right now.
    function checkEligibility(
        uint256 roundId,
        address wallet,
        uint256 amount,
        bytes32[] calldata proof
    )
        external
        view
        roundExists(roundId)
        returns (bool isEligible, bool canClaim)
    {
        Round storage round = rounds[roundId];
        bytes32 leaf = keccak256(abi.encodePacked(wallet, amount));
        isEligible = MerkleProof.verify(proof, round.merkleRoot, leaf);

        canClaim =
            isEligible &&
            !hasClaimed[roundId][wallet] &&
            block.timestamp >= round.claimStartTime &&
            block.timestamp < round.claimEndTime &&
            amount > 0 &&
            amount <= round.maxClaimPerAccount &&
            !paused() &&
            round.totalClaimedAmount + amount <= round.totalSuppliedAmount &&
            amount <= token.balanceOf(address(this));
    }

    /// @notice Claim time status for a round.
    function getClaimTimeStatus(
        uint256 roundId
    )
        external
        view
        roundExists(roundId)
        returns (
            bool hasStarted,
            uint256 startTimeRemaining,
            bool hasEnded,
            uint256 endTimeRemaining
        )
    {
        Round storage round = rounds[roundId];

        hasStarted = block.timestamp >= round.claimStartTime;
        hasEnded = block.timestamp >= round.claimEndTime;
        startTimeRemaining = hasStarted
            ? 0
            : round.claimStartTime - block.timestamp;
        endTimeRemaining = hasEnded ? 0 : round.claimEndTime - block.timestamp;
    }

    /// @notice Owner-only snapshot with round data and current contract token balance.
    function getAirdropInfos(
        uint256 roundId
    )
        external
        view
        roundExists(roundId)
        returns (Round memory round, uint256 contractBalance)
    {
        round = rounds[roundId];
        contractBalance = token.balanceOf(address(this));
    }

    /// @notice Recover a round's unclaimed tokens.
    /// @param roundId Target round id.
    /// @param to Receiver of leftover tokens.
    function withdraw(
        uint256 roundId,
        address to
    ) external onlyOwner nonReentrant roundExists(roundId) {
        require(to != address(0), "Invalid receiver");

        Round storage round = rounds[roundId];
        uint256 amount = round.totalSuppliedAmount - round.totalClaimedAmount;
        require(amount > 0, "Invalid amount");

        round.totalClaimedAmount = round.totalSuppliedAmount;
        token.safeTransfer(to, amount);

        emit Withdrawn(roundId, to, amount);
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
