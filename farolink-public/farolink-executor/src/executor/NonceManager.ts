import { ethers } from "ethers";

/**
 * NonceManager — serializes nonce acquisition to prevent collisions under concurrent requests.
 * Fix #20: BridgeAbstractor was sending transactions without nonce management,
 *          causing two concurrent TXs to get the same nonce and one to silently fail.
 *
 * Uses a promise-chain mutex pattern — each caller awaits the previous one
 * before getting the next sequential nonce. No external lock library required.
 */
export class NonceManager {
    private pendingNonce: number | null = null;
    private lock = Promise.resolve();

    constructor(
        private provider: ethers.JsonRpcProvider,
        private address: string
    ) {}

    /**
     * Atomically acquires the next available nonce.
     * Chains promises so concurrent callers get strictly sequential values.
     */
    async getNextNonce(): Promise<number> {
        let resolveNext!: () => void;

        // Each call appends to the end of the promise chain
        const previous = this.lock;
        this.lock = new Promise(resolve => { resolveNext = resolve; });

        // Wait for the previous caller to finish
        await previous;

        try {
            // Fetch from RPC on first call or after a reset
            if (this.pendingNonce === null) {
                this.pendingNonce = await this.provider.getTransactionCount(
                    this.address,
                    'pending'  // Include pending TXs to avoid reuse
                );
            }
            return this.pendingNonce++;
        } finally {
            // Release the lock so the next queued caller can proceed
            resolveNext();
        }
    }

    /**
     * Resets the nonce cache.
     * Fix L-1: Acquires the promise-chain lock before nullifying pendingNonce so that
     * concurrent callers mid-`getNextNonce()` cannot observe an inconsistent nonce state.
     * Call this after a transaction is dropped or a nonce-related error occurs.
     */
    async reset(): Promise<void> {
        let resolveNext!: () => void;
        const previous = this.lock;
        this.lock = new Promise(resolve => { resolveNext = resolve; });
        await previous;
        try {
            this.pendingNonce = null;
        } finally {
            resolveNext();
        }
    }

    /**
     * Returns the current address being managed.
     */
    getAddress(): string {
        return this.address;
    }
}
