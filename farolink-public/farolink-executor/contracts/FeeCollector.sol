// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FeeCollector
 * @notice Fix #28: Adds withdrawal functions so collected fees are not permanently locked.
 *         The previous version was `function collect() external payable {}` with no way
 *         to get the funds out. This fix adds withdrawNative, withdrawToken, and events.
 *
 * @dev Receives protocol fees from FaroLinkRouter on each bridge hop.
 *      Fees accumulate here and are periodically withdrawn by the protocol treasury.
 */
contract FeeCollector is Ownable {
    using SafeERC20 for IERC20;

    // ─── Events ───────────────────────────────────────────────────────────────
    event FeeReceived(address indexed from, uint256 amount);
    event NativeWithdrawn(address indexed to, uint256 amount);
    event TokenWithdrawn(address indexed token, address indexed to, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor() Ownable(msg.sender) {}

    // ─── Fee Receipt ──────────────────────────────────────────────────────────

    /**
     * @notice Accept native ETH fee payments from the router.
     */
    function collect() external payable {
        emit FeeReceived(msg.sender, msg.value);
    }

    // ─── Withdrawals ──────────────────────────────────────────────────────────

    /**
     * @notice Withdraw accumulated native ETH fees to the treasury.
     * @param to     Recipient address (treasury multisig)
     * @param amount Amount of ETH to withdraw (in wei)
     */
    function withdrawNative(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero address");
        require(address(this).balance >= amount, "Insufficient ETH balance");

        (bool ok,) = to.call{value: amount}("");
        require(ok, "ETH transfer failed");

        emit NativeWithdrawn(to, amount);
    }

    /**
     * @notice Withdraw accumulated ERC-20 token fees to the treasury.
     * @param token  ERC-20 token contract address
     * @param to     Recipient address (treasury multisig)
     * @param amount Amount of tokens to withdraw
     */
    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero address");
        IERC20(token).safeTransfer(to, amount);
        emit TokenWithdrawn(token, to, amount);
    }

    /**
     * @notice Withdraw all of a specific ERC-20 token in one call.
     * @param token ERC-20 token contract address
     * @param to    Recipient address
     */
    function withdrawAllToken(address token, address to) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance to withdraw");
        IERC20(token).safeTransfer(to, balance);
        emit TokenWithdrawn(token, to, balance);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the native ETH balance held by this contract.
     */
    function nativeBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Returns the ERC-20 token balance held by this contract.
     */
    function tokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    receive() external payable {
        emit FeeReceived(msg.sender, msg.value);
    }
}
