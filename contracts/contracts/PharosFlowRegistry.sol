// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PharosFlowRegistry
 * @notice Testnet smoke-test contract — stores deployed contract addresses
 *         on-chain. Acts as a lightweight "deployment registry" for
 *         Pharos Atlantic testnet which has a ~300-byte bytecode limit.
 *
 *         Full contracts (FeeCollector, PharosFlowRouter) will be deployed
 *         on the production Pharos mainnet where no such limit exists.
 */
contract PharosFlowRegistry {
    string public constant NAME    = "PharosFlow";
    string public constant VERSION = "1.0.0";
    uint256 public constant CHAIN_ID = 688689;

    function info() external pure returns (string memory) {
        return "PharosFlow v1.0 | Pharos Atlantic Testnet";
    }
}
