import { ethers } from 'ethers';
import { Route } from '../types/route';

export interface MEVProtection {
    commitHash:          string;   // keccak256(intentData + salt)
    salt:                string;   // 32-byte random hex
    revealDeadlineBlock: number;
    intentData:          string;   // original calldata, kept private until reveal
    usePrivateRpc:       boolean;
    submissionEndpoint:  string;
}

export interface RiskAssessment {
    isAtRisk: boolean;
    reason:   string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * MEVShield — two-layer MEV protection.
 * Fix #12: Replaces the empty stub with a real commit-reveal scheme + private RPC routing.
 *
 * Layer 1: Commitment scheme
 *   Hash the intent before broadcast. Submit hash first; reveal full calldata after N blocks.
 *   Prevents sandwich bots from front-running the mempool.
 *
 * Layer 2: Private RPC routing
 *   For high-value / high-impact trades, route through a private mempool relay
 *   (e.g. Flashbots, MEV Blocker) to bypass the public mempool entirely.
 */
export class MEVShield {
    private readonly HIGH_IMPACT_BPS = 50;               // 0.5% — above this is at risk
    private readonly HIGH_VALUE_WEI  = 1000000000000000000n; // 1 ETH

    constructor(private privateRpcUrl: string = '') {}

    /**
     * Creates a commitment hash for an intent payload.
     * The full intent calldata is not broadcast until the reveal step.
     */
    public createCommitment(intentData: string): Omit<MEVProtection, 'usePrivateRpc' | 'submissionEndpoint'> {
        const salt       = ethers.hexlify(ethers.randomBytes(32));
        const commitHash = ethers.keccak256(
            ethers.solidityPacked(['bytes', 'bytes32'], [intentData, salt])
        );
        return {
            commitHash,
            salt,
            revealDeadlineBlock: 0, // Caller sets this based on current block + N
            intentData,
        };
    }

    /**
     * Assesses whether a route's parameters make it vulnerable to MEV sandwich attacks.
     *
     * A trade is at-risk if:
     *   - Price impact > 0.5% AND amountIn > 1 ETH (MEDIUM)
     *   - Price impact > 2%   OR  amountIn > 10 ETH (HIGH)
     */
    public assessRisk(priceImpactBps: number, amountIn: bigint): RiskAssessment {
        const TEN_ETH = this.HIGH_VALUE_WEI * 10n;

        if (priceImpactBps > 200 || amountIn > TEN_ETH) {
            return {
                isAtRisk: true,
                severity: 'HIGH',
                reason: `Very high MEV exposure: impact=${priceImpactBps}bps, amount=${amountIn.toString()} wei`,
            };
        }
        if (priceImpactBps > this.HIGH_IMPACT_BPS && amountIn > this.HIGH_VALUE_WEI) {
            return {
                isAtRisk: true,
                severity: 'MEDIUM',
                reason: `Moderate MEV exposure: impact=${priceImpactBps}bps on large trade`,
            };
        }
        return { isAtRisk: false, reason: 'Low MEV risk', severity: 'LOW' };
    }

    /**
     * Full MEV protection pipeline applied to an outgoing route.
     * Returns the commitment + submission metadata the Executor uses when sending TXs.
     */
    public applyProtection(
        intentData: string,
        priceImpactBps: number,
        amountIn: bigint
    ): MEVProtection {
        const commitment = this.createCommitment(intentData);
        const risk       = this.assessRisk(priceImpactBps, amountIn);

        return {
            ...commitment,
            usePrivateRpc:      risk.isAtRisk && this.privateRpcUrl.length > 0,
            submissionEndpoint: risk.isAtRisk ? this.privateRpcUrl : '',
        };
    }

    /**
     * Verifies that a commitment matches the revealed intent + salt.
     * Used by a smart contract or the executor to validate reveals.
     */
    public verifyReveal(commitment: MEVProtection): boolean {
        const expectedHash = ethers.keccak256(
            ethers.solidityPacked(['bytes', 'bytes32'], [commitment.intentData, commitment.salt])
        );
        return expectedHash === commitment.commitHash;
    }

    public getPrivateEndpoint(): string {
        return this.privateRpcUrl;
    }
}
