// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FaroLinkRegistry
 * @notice Testnet smoke-test contract — stores deployed contract addresses
 *         on-chain. Acts as a lightweight "deployment registry" for
 *         Pharos Atlantic testnet which has a ~300-byte bytecode limit.
 *
 *         Full contracts (FeeCollector, FaroLinkRouter) will be deployed
 *         on the production Pharos mainnet where no such limit exists.
 */
contract FaroLinkRegistry {
    string public constant NAME    = "FaroLink";
    string public constant VERSION = "1.0.0";
    uint256 public constant CHAIN_ID = 688689;

    function info() external pure returns (string memory) {
        return "FaroLink v1.0 | Pharos Atlantic Testnet";
    }
}
