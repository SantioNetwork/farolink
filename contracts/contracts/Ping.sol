// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Minimal smoke-test contract — no imports, no constructor args.
 * Used to verify the Pharos Atlantic testnet EVM accepts deployments.
 */
contract Ping {
    uint256 public constant VERSION = 1;

    function ping() external pure returns (string memory) {
        return "pong";
    }
}
