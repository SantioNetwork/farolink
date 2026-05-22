// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title FaroLinkRouter
 * @notice Fix #27: Implements real multi-hop route execution with ERC-20 handling,
 *         protocol fee collection, and native ETH support.
 *         Previously this was an empty stub that would permanently trap any ETH sent to it.
 *
 * @dev Each hop specifies a bridge adapter address and pre-encoded calldata.
 *      The executor service prepares and signs the intent; this contract validates
 *      and dispatches the encoded calls to registered bridge adapters.
 */
contract FaroLinkRouter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────────
    address public feeCollector;
    uint256 public feeBps = 5;  // 0.05% protocol fee

    // Fix M4: Emergency pause
    bool public paused;

    mapping(address => bool) public approvedAdapters;

    // ─── Events ───────────────────────────────────────────────────────────────
    event RouteExecuted(
        address indexed user,
        bytes32 indexed routeId,
        address         tokenIn,
        uint256         amountIn,
        uint256         hopCount
    );
    event ProtocolFeeCollected(address indexed token, uint256 amount);
    event AdapterApproved(address indexed adapter, bool approved);
    event FeeCollectorUpdated(address indexed newFeeCollector);
    event FeeBpsUpdated(uint256 newFeeBps);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ─── Structs ──────────────────────────────────────────────────────────────
    struct HopData {
        address bridgeAdapter;  // Must be in approvedAdapters
        bytes   callData;       // Pre-encoded bridge call
        address tokenIn;        // ERC-20 address (or address(0) for native ETH)
        uint256 amountIn;       // Amount of tokenIn to bridge
        bool    isNative;       // True if sending native ETH
    }

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address _feeCollector) Ownable(msg.sender) {
        require(_feeCollector != address(0), "Invalid fee collector");
        feeCollector = _feeCollector;
    }

    // ─── Core Execution ───────────────────────────────────────────────────────

    // Fix M4: Emergency stop modifier
    modifier whenNotPaused() {
        require(!paused, "FaroLinkRouter: paused");
        _;
    }

    /**
     * @notice Execute a multi-hop cross-chain route.
     * @param hops    Array of hop descriptors (adapter + calldata + token info)
     * @param routeId Unique route ID from the routing engine (for tracking)
     */
    function executePath(
        HopData[] calldata hops,
        bytes32 routeId
    ) external payable nonReentrant whenNotPaused {
        require(hops.length > 0 && hops.length <= 5, "Invalid hop count");

        for (uint256 i = 0; i < hops.length; i++) {
            HopData calldata hop = hops[i];

            require(approvedAdapters[hop.bridgeAdapter], string.concat("Unapproved adapter at hop ", Strings.toString(i)));

            if (!hop.isNative) {
                // ERC-20: pull tokens from user, collect fee, approve adapter
                IERC20(hop.tokenIn).safeTransferFrom(msg.sender, address(this), hop.amountIn);

                uint256 fee = (hop.amountIn * feeBps) / 10000;
                if (fee > 0) {
                    IERC20(hop.tokenIn).safeTransfer(feeCollector, fee);
                    emit ProtocolFeeCollected(hop.tokenIn, fee);
                }

                uint256 bridgeAmount = hop.amountIn - fee;
                IERC20(hop.tokenIn).forceApprove(hop.bridgeAdapter, bridgeAmount);

                (bool ok, bytes memory errData) = hop.bridgeAdapter.call(hop.callData);

                // Fix H-4: Revoke approval BEFORE bubbling revert so adapter can never
                // retain a residual allowance even when the assembly path fires.
                IERC20(hop.tokenIn).forceApprove(hop.bridgeAdapter, 0);

                if (!ok) {
                    if (errData.length > 0) {
                        assembly { revert(add(32, errData), mload(errData)) }
                    }
                    revert(string.concat("Hop ", Strings.toString(i), " reverted"));
                }
            } else {
                // Native ETH hop
                require(msg.value >= hop.amountIn, "Insufficient native value");

                uint256 fee = (hop.amountIn * feeBps) / 10000;
                if (fee > 0) {
                    (bool feeOk,) = feeCollector.call{value: fee}("");
                    require(feeOk, "Fee transfer failed");
                    emit ProtocolFeeCollected(address(0), fee);
                }

                uint256 bridgeValue = hop.amountIn - fee;
                (bool ok, bytes memory errData) = hop.bridgeAdapter.call{value: bridgeValue}(hop.callData);
                if (!ok) {
                    if (errData.length > 0) {
                        assembly { revert(add(32, errData), mload(errData)) }
                    }
                    revert(string.concat("Native hop ", Strings.toString(i), " reverted"));
                }
            }
        }

        emit RouteExecuted(msg.sender, routeId, hops[0].tokenIn, hops[0].amountIn, hops.length);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function approveAdapter(address adapter, bool approved) external onlyOwner {
        approvedAdapters[adapter] = approved;
        emit AdapterApproved(adapter, approved);
    }

    function setFeeCollector(address _fc) external onlyOwner {
        require(_fc != address(0), "Zero address");
        feeCollector = _fc;
        emit FeeCollectorUpdated(_fc);
    }

    function setFeeBps(uint256 _bps) external onlyOwner {
        require(_bps <= 100, "Fee cannot exceed 1%");
        feeBps = _bps;
        emit FeeBpsUpdated(_bps);
    }

    /**
     * @notice Emergency rescue for ERC-20 tokens accidentally sent to this contract.
     */
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @notice Fix C4: Emergency rescue for native ETH accidentally sent to this contract.
     * @dev ETH can arrive via selfdestruct or direct transfer. Without this it would be
     *      permanently locked since executePath() does not hold ETH between calls.
     */
    function rescueETH(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero address");
        require(address(this).balance >= amount, "Insufficient ETH balance");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    /**
     * @notice Fix M4: Emergency pause — halts all new route executions.
     * @dev Call this immediately if a bridge adapter is exploited.
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        if (_paused) emit Paused(msg.sender);
        else         emit Unpaused(msg.sender);
    }

    receive() external payable {}
}
