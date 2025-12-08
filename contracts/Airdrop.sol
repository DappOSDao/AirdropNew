// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title Airdrop
/// @notice Streams ERC20 rewards to addresses listed in a Merkle tree while
///         preserving pause controls and post-deadline recovery flows.
contract Airdrop is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    bytes32 public merkleRoot;
    uint256 public claimEndTime;

    mapping(address => bool) public hasClaimed;
    uint256 private _totalClaimedCount;
    uint256 private _totalClaimedAmount;

    event MerkleRootSetted(bytes32 indexed root);
    event Claimed(address indexed addr, uint256 amount);
    event ClaimEndTimeSetted(uint256 newEndTime);
    event Withdrawn(address indexed addr, uint256 amount);

    /// @notice Initialize the contract and bind the ERC20 that will be streamed.
    /// @param tokenAddr ERC20 token distributed by this contract.
    constructor(address tokenAddr) Ownable(msg.sender) {
        require(tokenAddr != address(0), "Invalid token address");
        token = IERC20(tokenAddr);
    }

    /// @notice Configure the active Merkle tree.
    /// @param _merkleRoot Packed wallet+amount Merkle root.
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        require(_merkleRoot != bytes32(0), "Invalid merkle root");
        merkleRoot = _merkleRoot;

        emit MerkleRootSetted(_merkleRoot);
    }

    /// @notice Extend or shorten the claim deadline without touching the root.
    /// @param _claimEndTime Replacement timestamp for `claimEndTime`.
    function setClaimEndTime(uint256 _claimEndTime) external onlyOwner {
        require(_claimEndTime > block.timestamp, "Invalid end time");
        claimEndTime = _claimEndTime;

        emit ClaimEndTimeSetted(_claimEndTime);
    }

    /// @notice Claim tokens that were pre-allocated in the Merkle tree.
    /// @param amount Exact amount encoded for the caller.
    /// @param proof Merkle branch that proves inclusion.
    function claim(
        uint256 amount,
        bytes32[] calldata proof
    ) external whenNotPaused nonReentrant {
        require(merkleRoot != bytes32(0), "Merkle root unset");
        require(block.timestamp < claimEndTime, "Deadline elapsed");
        require(!hasClaimed[msg.sender], "Already claimed");
        require(amount > 0, "No tokens to claim");
        require(
            amount <= token.balanceOf(address(this)),
            "Insufficient balance"
        );

        // Verify the Merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        bool isValidProof = MerkleProof.verify(proof, merkleRoot, leaf);
        require(isValidProof, "Invalid proof");

        // Mark as claimed and transfer tokens
        hasClaimed[msg.sender] = true;
        _totalClaimedCount++;
        _totalClaimedAmount += amount;

        token.safeTransfer(msg.sender, amount);

        emit Claimed(msg.sender, amount);
    }

    /// @notice View helper to check a proof and operational constraints.
    /// @param wallet Address to inspect.
    /// @param amount Amount linked to `wallet` in the tree.
    /// @param proof Merkle branch to validate.
    /// @return isEligible True if the branch matches the current root.
    /// @return canClaim True if the wallet can still claim right now.
    function checkEligibility(
        address wallet,
        uint256 amount,
        bytes32[] calldata proof
    ) external view returns (bool isEligible, bool canClaim) {
        bytes32 leaf = keccak256(abi.encodePacked(wallet, amount));
        isEligible = MerkleProof.verify(proof, merkleRoot, leaf);

        canClaim =
            isEligible &&
            !hasClaimed[wallet] &&
            block.timestamp < claimEndTime &&
            amount > 0 &&
            !paused() &&
            amount <= token.balanceOf(address(this));
    }

    /// @notice Seconds left until `claimEndTime` elapses (0 if expired).
    function getClaimTimeRemaining()
        external
        view
        returns (uint256 claimTimeRemaining)
    {
        if (block.timestamp >= claimEndTime) {
            return 0;
        }
        return claimEndTime - block.timestamp;
    }

    /// @notice Owner-only snapshot with aggregate distribution stats.
    /// @return totalClaimedCount Number of wallets that claimed successfully.
    /// @return totalClaimedAmount Total tokens transferred out.
    /// @return _balance Current ERC20 balance held by the contract.
    /// @return _merkleRoot Active Merkle root.
    /// @return _claimEndTime Current claim deadline timestamp.
    /// @return _isClaimable True if the deadline has not yet elapsed.
    function getAirdropInfos()
        external
        view
        onlyOwner
        returns (
            uint256 totalClaimedCount,
            uint256 totalClaimedAmount,
            uint256 _balance,
            bytes32 _merkleRoot,
            uint256 _claimEndTime,
            bool _isClaimable
        )
    {
        return (
            _totalClaimedCount,
            _totalClaimedAmount,
            token.balanceOf(address(this)),
            merkleRoot,
            claimEndTime,
            block.timestamp < claimEndTime
        );
    }

    /// @notice Recover leftover tokens after the claim window ends.
    /// @param amount Amount to transfer to the owner.
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Invalid amount");
        require(
            amount <= token.balanceOf(address(this)),
            "Insufficient balance "
        );
        require(
            block.timestamp >= claimEndTime || merkleRoot == bytes32(0),
            "Withdraw disabled"
        );
        token.safeTransfer(owner(), amount);

        emit Withdrawn(owner(), amount);
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
