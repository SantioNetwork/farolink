export class SlippageOracle {
    /**
     * Calculates price impact in basis points using the constant-product AMM formula.
     * Fix #14: Correct method signature (was parameterless) and real math (was hardcoded 50).
     *
     * Formula: output = reserve1 * amountInWithFee / (reserve0 + amountInWithFee)
     * Impact   = (idealOutput - actualOutput) / idealOutput * 10000
     *
     * @param poolAddress  Cache key for future RPC-based reserve fetching
     * @param amountIn     Input token amount (bigint)
     * @param reserve0     Pool reserve of input token  (bigint, default 1000 tokens)
     * @param reserve1     Pool reserve of output token (bigint, default 1000 tokens)
     * @param feeBps       Pool fee in basis points (default 30 = 0.3%)
     * @returns            Price impact in basis points (integer)
     */
    public getSlippage(
        poolAddress: string,
        amountIn: bigint,
        reserve0: bigint = 1000000000000000000000n,
        reserve1: bigint = 1000000000000000000000n,
        feeBps: number = 30
    ): number {
        if (reserve0 === 0n || reserve1 === 0n || amountIn === 0n) return 0;

        // Apply fee to input
        const amountInWithFee = (amountIn * BigInt(10000 - feeBps)) / 10000n;

        // Constant-product output
        const actualOutput = (reserve1 * amountInWithFee) / (reserve0 + amountInWithFee);

        // Ideal output at spot price (no slippage)
        const idealOutput = (reserve1 * amountIn) / reserve0;

        if (idealOutput === 0n) return 0;

        const impactBps = Number(((idealOutput - actualOutput) * 10000n) / idealOutput);
        return Math.max(0, impactBps);
    }
}

