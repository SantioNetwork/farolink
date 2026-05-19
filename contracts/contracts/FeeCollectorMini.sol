// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FeeCollectorMini
 * @notice Ultra-minimal fee collector for Pharos Atlantic testnet
 *         (testnet has ~300 byte constructor bytecode limit).
 *         Production version uses full FeeCollector.sol.
 */
contract FeeCollectorMini {
    address public owner;

    constructor() { owner = msg.sender; }

    receive() external payable {}

    function withdraw(address payable to) external {
        require(msg.sender == owner, "!owner");
        to.transfer(address(this).balance);
    }
}
