// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MockRestaking is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    uint256 public nextId;

    mapping(uint256 => mapping(address => uint256)) public restakedAmount;

    event Restaked(
        uint256 indexed id,
        uint256 indexed roundId,
        address indexed user,
        uint256 amount
    );

    constructor(address tokenAddr) {
        require(tokenAddr != address(0), "Invalid token address");
        token = IERC20(tokenAddr);
    }

    function restake(
        uint256 roundId,
        address user,
        uint256 amount
    ) external nonReentrant returns (uint256 id) {
        require(user != address(0), "Invalid user");
        require(amount > 0, "Invalid amount");

        id = ++nextId;
        restakedAmount[roundId][user] += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);

        emit Restaked(id, roundId, user, amount);
    }
}
