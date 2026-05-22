// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FaroLinkRouter
 * @notice Minimal implementation with zero external imports.
 *         Reentrancy guard and ownership are inlined to avoid
 *         Pharos Atlantic testnet EVM compatibility issues with OZ.
 */
contract FaroLinkRouter {

    address public owner;
    uint16  public feeBps;
    address public feeRecipient;
    uint16  public constant MAX_FEE_BPS = 100;

    // Reentrancy guard
    uint256 private _lock = 1;
    modifier nonReentrant() {
        require(_lock == 1, "Reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    event Swapped(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeTaken,
        address dex
    );
    event FeeUpdated(uint16 oldBps, uint16 newBps);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    constructor(uint16 _feeBps, address _feeRecipient) {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        require(_feeRecipient != address(0), "Zero fee recipient");
        owner        = msg.sender;
        feeBps       = _feeBps;
        feeRecipient = _feeRecipient;
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _transferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transferFrom failed");
    }

    function _transfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }

    function _approve(address token, address spender, uint256 amount) internal {
        (bool ok,) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", spender, amount)
        );
        require(ok, "approve failed");
    }

    function _balanceOf(address token) internal view returns (uint256) {
        if (token == address(0)) return address(this).balance;
        (, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("balanceOf(address)", address(this))
        );
        return abi.decode(data, (uint256));
    }

    // ── ERC-20 input swap ─────────────────────────────────────────────────────

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address dex,
        bytes calldata swapData
    ) external nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "Zero amount");
        require(dex != address(0), "Zero dex");

        _transferFrom(tokenIn, msg.sender, address(this), amountIn);

        uint256 fee = (amountIn * feeBps) / 10_000;
        uint256 net = amountIn - fee;
        if (fee > 0) _transfer(tokenIn, feeRecipient, fee);

        _approve(tokenIn, dex, net);
        uint256 snapshot = _balanceOf(tokenOut);

        (bool ok,) = dex.call(swapData);
        require(ok, "DEX call failed");
        _approve(tokenIn, dex, 0);

        amountOut = _balanceOf(tokenOut) - snapshot;
        require(amountOut >= minAmountOut, "Slippage exceeded");

        if (tokenOut == address(0)) {
            (bool sent,) = msg.sender.call{value: amountOut}("");
            require(sent, "Native send failed");
        } else {
            _transfer(tokenOut, msg.sender, amountOut);
        }

        emit Swapped(msg.sender, tokenIn, tokenOut, amountIn, amountOut, fee, dex);
    }

    // ── Native input swap ─────────────────────────────────────────────────────

    function swapNative(
        address tokenOut,
        uint256 minAmountOut,
        address dex,
        bytes calldata swapData
    ) external payable nonReentrant returns (uint256 amountOut) {
        uint256 amountIn = msg.value;
        require(amountIn > 0, "Zero amount");

        uint256 fee = (amountIn * feeBps) / 10_000;
        uint256 net = amountIn - fee;
        if (fee > 0) {
            (bool ok,) = feeRecipient.call{value: fee}("");
            require(ok, "Fee send failed");
        }

        uint256 snapshot = _balanceOf(tokenOut);
        (bool ok2,) = dex.call{value: net}(swapData);
        require(ok2, "DEX call failed");

        amountOut = _balanceOf(tokenOut) - snapshot;
        require(amountOut >= minAmountOut, "Slippage exceeded");
        _transfer(tokenOut, msg.sender, amountOut);

        emit Swapped(msg.sender, address(0), tokenOut, amountIn, amountOut, fee, dex);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setFeeBps(uint16 _feeBps) external onlyOwner {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        emit FeeUpdated(feeBps, _feeBps);
        feeBps = _feeBps;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Zero address");
        emit FeeRecipientUpdated(feeRecipient, _feeRecipient);
        feeRecipient = _feeRecipient;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    receive() external payable {}
}
