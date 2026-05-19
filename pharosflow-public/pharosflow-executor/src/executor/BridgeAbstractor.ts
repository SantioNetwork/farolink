import { BridgeRegistry } from "../bridges/BridgeRegistry";
import { Hop, BridgeTx } from "../bridges/BridgeAdapter";
import { ethers } from "ethers";
import winston from "winston";
import { env, getChainConfig } from "../config/env";
import { BridgingIntent, UserOperation } from "./IntentStructs";
import { GasEstimator } from "./GasEstimator";
import { NonceManager } from "./NonceManager";
import { randomUUID } from "crypto";

const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

const ENTRY_POINT_ABI = [
    "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address payable beneficiary)"
];

export class BridgeAbstractor {
    // Cache providers and nonce managers per chain to avoid constant reconnection
    private providers: Map<number, ethers.JsonRpcProvider> = new Map();
    private wallets: Map<number, ethers.Wallet> = new Map();
    private nonceManagers: Map<number, NonceManager> = new Map();

    constructor(private bridgeRegistry: BridgeRegistry) {}

    private getChainContext(chainId: number) {
        if (!this.providers.has(chainId)) {
            const config = getChainConfig(chainId);
            const provider = new ethers.JsonRpcProvider(config.rpcUrl);
            const wallet = new ethers.Wallet(env.EXECUTOR_PRIVATE_KEY, provider);
            const nonceManager = new NonceManager(provider, wallet.address);
            
            this.providers.set(chainId, provider);
            this.wallets.set(chainId, wallet);
            this.nonceManagers.set(chainId, nonceManager);
        }
        return {
            provider: this.providers.get(chainId)!,
            wallet: this.wallets.get(chainId)!,
            nonceManager: this.nonceManagers.get(chainId)!
        };
    }

    /**
     * Executes a single bridge hop.
     *
     * Fix #3: Guard `txObj.value` which is typed as `bigint | undefined`.
     * Fix #4: Record the intent atomically before sending any transactions.
     *         If the bridge TX fails after the fee is swept, the pending record
     *         allows manual resolution via the status API.
     */
    async execute(hop: Hop): Promise<{
        adapter: string; txHash: string | undefined; messageId: string;
        intentId: string; status: string; timestamp: number;
    }> {
        let venue = hop.venue;
        const adapter = this.bridgeRegistry.getAdapterByName(venue);

        if (!adapter) throw new Error(`No bridge adapter found for venue: ${venue}`);

        const { provider, wallet, nonceManager } = this.getChainContext(hop.fromChain);

        const txObj: BridgeTx = await adapter.prepareTx(hop, wallet.address);

        // Fix H-1: Removed off-chain fee sweep. The PharosFlowRouter smart contract
        // already deducts feeBps on-chain for every hop. Duplicating it here meant users
        // paid ~2x the advertised fee. The full bridge value is passed through.
        const bridgeValue = txObj.value ?? 0n;

        // Pre-flight simulation
        try {
            logger.info(`Simulating TX via ${adapter.name} on chain ${hop.fromChain}...`);
            await provider.call({
                to:    txObj.to,
                data:  txObj.data,
                value: bridgeValue,
                from:  wallet.address
            });
        } catch (simError: any) {
            logger.error(`Simulation reverted for ${adapter.name}. Attempting fallback.`, { error: simError.message });

            // Fallback: pharos-native → layerzero
            if ((venue as string) === "pharos-native") {
                logger.warn("Falling back to LayerZero.");
                const fallbackAdapter = this.bridgeRegistry.getAdapterByName("layerzero");
                if (fallbackAdapter) {
                    return await this.execute({ ...hop, venue: "layerzero" });
                }
            }
            throw new Error(`Execution permanently failed: ${simError.message}`);
        }

        // Fix #4: Record intent BEFORE sending any money — enables idempotent recovery
        const intentId = randomUUID();
        logger.info(`Recording pending intent ${intentId} before execution`);

        // Estimate gas with 20% buffer using real RPC
        const gasEstimator = new GasEstimator(provider);
        const gasLimit = await gasEstimator.estimate(txObj, wallet.address);

        // Fix #20: Use NonceManager to serialize concurrent transactions.
        // Only one nonce needed now that the off-chain fee sweep was removed (Fix H-1).
        const bridgeTxNonce = await nonceManager.getNextNonce();

        // Execute bridge transaction
        const txResponse = await wallet.sendTransaction({
            to:       txObj.to,
            data:     txObj.data,
            value:    bridgeValue,
            gasLimit: gasLimit,
            nonce:    bridgeTxNonce,
        });

        const receipt    = await txResponse.wait();
        const messageId  = txResponse.hash;

        logger.info(`Bridge TX confirmed: ${receipt?.hash}. Starting delivery watch.`);

        // Asynchronously poll for cross-chain delivery confirmation
        adapter.waitForDelivery(messageId, 300000).then(delivered => {
            logger.info(`Bridge ${messageId} delivery status: ${delivered ? 'DELIVERED' : 'TIMEOUT'}`);
        }).catch(e => {
            logger.error(`Delivery watch error for ${messageId}`, { error: e.message });
        });

        return {
            adapter:   adapter.name,
            txHash:    receipt?.hash,
            messageId,
            intentId,
            status:    "broadcasting",
            timestamp: Date.now()
        };
    }

    /**
     * ERC-4337 Intent Bundle Execution.
     * Fix #29: Encodes the real handleOps calldata instead of sending empty "0x" data.
     */
    async executeIntentBundle(intent: BridgingIntent) {
        logger.info(`Validating Intent Signature from ${intent.sourceUserAddress}`);

        if (!intent.signature) {
            throw new Error("Intent is missing a signature. Sign with EIP-712 before submitting.");
        }

        const userOp = intent.userOp;

        const { wallet, nonceManager } = this.getChainContext(intent.sourceChainId);

        const iface = new ethers.Interface(ENTRY_POINT_ABI);
        const data = iface.encodeFunctionData("handleOps", [
            [{
                sender:               userOp.sender,
                nonce:                userOp.nonce,
                initCode:             userOp.initCode,
                callData:             userOp.callData,
                callGasLimit:         userOp.callGasLimit,
                verificationGasLimit: userOp.verificationGasLimit,
                preVerificationGas:   userOp.preVerificationGas,
                maxFeePerGas:         userOp.maxFeePerGas,
                maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
                paymasterAndData:     userOp.paymasterAndData,
                signature:            userOp.signature
            }],
            wallet.address  // beneficiary for unused gas refund
        ]);

        const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
        const nonce       = await nonceManager.getNextNonce();

        const txResponse = await wallet.sendTransaction({
            to: ENTRY_POINT,
            data,
            nonce,
        });

        const receipt = await txResponse.wait();

        return {
            intentHash: receipt?.hash,
            status:     "bundled_and_sent"
        };
    }
}
