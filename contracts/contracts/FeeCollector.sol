// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FeeCollector
 * @notice Minimal implementation with zero external imports.
 *         OpenZeppelin Ownable/SafeERC20 are inlined to avoid
 *         Pharos Atlantic testnet EVM compatibility issues.
 */
contract FeeCollector {

    address public owner;

    event FeeReceived(address indexed from, uint256 amount);
    event NativeWithdrawn(address indexed to, uint256 amount);
    event TokenWithdrawn(address indexed token, address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // Accept ETH fees
    function collect() external payable {
        emit FeeReceived(msg.sender, msg.value);
    }

    // Withdraw native
    function withdrawNative(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero address");
        require(address(this).balance >= amount, "Insufficient balance");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "Transfer failed");
        emit NativeWithdrawn(to, amount);
    }

    // Withdraw ERC-20 (inline transfer call)
    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero address");
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "Token transfer failed");
        emit TokenWithdrawn(token, to, amount);
    }

    function nativeBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        emit FeeReceived(msg.sender, msg.value);
    }
}
