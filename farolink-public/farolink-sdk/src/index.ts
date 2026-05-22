import axios, { AxiosInstance, AxiosError } from 'axios';
import {
    RouteRequest, RouteResponse, BridgingIntent,
    ExecutionResponse, StatusResponse, ClientConfig
} from './types';

export * from './types';

// ─── Structured Error Class ───────────────────────────────────────────────────

/**
 * All errors thrown by FaroLinkClient are instances of FaroLinkError.
 * This lets consumers catch and branch on SDK errors cleanly:
 *
 *   try { await client.getQuote(...) }
 *   catch (e) {
 *     if (e instanceof FaroLinkError) { console.log(e.statusCode, e.code) }
 *   }
 */
export class FaroLinkError extends Error {
    constructor(
        message: string,
        /** HTTP status code, if the error came from the API */
        public readonly statusCode?: number,
        /** Machine-readable error code (e.g. 'RATE_LIMITED', 'INVALID_SIGNATURE') */
        public readonly code?: string,
        /** Raw API response body, if available */
        public readonly body?: unknown,
    ) {
        super(message);
        this.name = 'FaroLinkError';
    }
}

/** Converts an axios error into a structured FaroLinkError */
function wrapAxiosError(err: unknown): never {
    if (axios.isAxiosError(err)) {
        const axErr = err as AxiosError<{ error?: string; code?: string }>;
        const status  = axErr.response?.status;
        const body    = axErr.response?.data;
        const message = body?.error ?? axErr.message;
        const code    = body?.code  ?? (status === 429 ? 'RATE_LIMITED' : status === 401 ? 'UNAUTHORIZED' : 'API_ERROR');
        throw new FaroLinkError(message, status, code, body);
    }
    throw err; // re-throw non-axios errors unchanged (e.g. user rejected signature)
}

// ─── EIP-712 Constants ────────────────────────────────────────────────────────

/**
 * EIP-712 domain and type definitions for FaroLink intent signing.
 * Exported so advanced users can build custom signing flows.
 * Must stay in sync with farolink-api/src/index.ts INTENT_DOMAIN / INTENT_TYPES.
 */
export const FAROLINK_INTENT_DOMAIN = {
    name:    'FaroLink',
    version: '1',
} as const;

export const FAROLINK_INTENT_TYPES = {
    BridgingIntent: [
        { name: 'sourceUserAddress',      type: 'address' },
        { name: 'destinationUserAddress', type: 'address' },
        { name: 'sourceToken',            type: 'address' },
        { name: 'destinationToken',       type: 'address' },
        { name: 'amountIn',               type: 'uint256' },
        { name: 'minAmountOut',           type: 'uint256' },
        { name: 'sourceChainId',          type: 'uint256' },
        { name: 'targetChainId',          type: 'uint256' },
        { name: 'deadline',               type: 'uint256' },
    ],
} as const;

// ─── Input Validation ─────────────────────────────────────────────────────────

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const WEI_STRING_RE  = /^\d+$/;

function validateRouteRequest(req: RouteRequest): void {
    if (!req.fromChain || !req.toChain)
        throw new FaroLinkError('RouteRequest: fromChain and toChain are required', undefined, 'INVALID_INPUT');
    if (!EVM_ADDRESS_RE.test(req.fromToken))
        throw new FaroLinkError(`RouteRequest: fromToken "${req.fromToken}" is not a valid EVM address`, undefined, 'INVALID_INPUT');
    if (!EVM_ADDRESS_RE.test(req.toToken))
        throw new FaroLinkError(`RouteRequest: toToken "${req.toToken}" is not a valid EVM address`, undefined, 'INVALID_INPUT');
    if (!WEI_STRING_RE.test(req.amountIn) || BigInt(req.amountIn) === 0n)
        throw new FaroLinkError(`RouteRequest: amountIn "${req.amountIn}" must be a non-zero wei amount as a decimal string`, undefined, 'INVALID_INPUT');
    if (req.userAddress && !EVM_ADDRESS_RE.test(req.userAddress))
        throw new FaroLinkError(`RouteRequest: userAddress "${req.userAddress}" is not a valid EVM address`, undefined, 'INVALID_INPUT');
}

function validateIntent(intent: BridgingIntent): void {
    if (!EVM_ADDRESS_RE.test(intent.sourceUserAddress))
        throw new FaroLinkError('BridgingIntent: sourceUserAddress is not a valid EVM address', undefined, 'INVALID_INPUT');
    if (!intent.sourceChainId || !intent.targetChainId)
        throw new FaroLinkError('BridgingIntent: sourceChainId and targetChainId are required', undefined, 'INVALID_INPUT');
    if (!WEI_STRING_RE.test(intent.amountIn))
        throw new FaroLinkError('BridgingIntent: amountIn must be a decimal string', undefined, 'INVALID_INPUT');
    if (intent.deadline < Math.floor(Date.now() / 1000))
        throw new FaroLinkError('BridgingIntent: deadline has already passed', undefined, 'INTENT_EXPIRED');
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class FaroLinkClient {
    private client: AxiosInstance;

    constructor(config: ClientConfig = {}) {
        this.client = axios.create({
            baseURL: config.apiUrl ?? 'https://api.farolink.net',
            // Default 30s timeout — prevents callers from hanging indefinitely
            timeout: config.timeoutMs ?? 30_000,
            headers: {
                'Content-Type': 'application/json',
                ...(config.apiKey && { 'x-farolink-api-key': config.apiKey }),
            },
        });
    }

    /**
     * Get an optimal cross-chain route and formulated intent payload ready to sign.
     *
     * @param request   Route parameters. Provide `userAddress` to receive a signable intentPayload.
     * @returns         Route response with hops, expected output, price impact, and optional intentPayload
     * @throws          FaroLinkError on invalid input or API error
     *
     * @example
     * const quote = await client.getQuote({
     *     fromChain: 1,
     *     toChain:   688688,
     *     fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum
     *     toToken:   '0x...', // USDC on Pharos
     *     amountIn:  '1000000',  // 1 USDC in wei (6 decimals)
     *     userAddress: '0xYourAddress',
     * });
     */
    async getQuote(request: RouteRequest): Promise<RouteResponse> {
        validateRouteRequest(request);
        try {
            const response = await this.client.post<RouteResponse>('/v1/quote', request);
            return response.data;
        } catch (err) {
            wrapAxiosError(err);
        }
    }

    /**
     * Sign a BridgingIntent using EIP-712 typed data.
     *
     * Uses `sourceChainId` for the EIP-712 domain — the chain where the user
     * is signing — matching what the API gateway verifies.
     *
     * Compatible with ethers v6 `Signer.signTypedData()` and
     * viem `walletClient.signTypedData()` via the duck-typed `signer` parameter.
     *
     * @param intent  The intentPayload from getQuote() — must have sourceChainId set
     * @param signer  Any wallet/signer with a signTypedData method
     * @returns       A copy of the intent with the `signature` field populated
     * @throws        FaroLinkError if the intent is already expired or invalid
     *
     * @example
     * const signed = await client.signIntent(quote.intentPayload!, ethersSigner);
     * const result = await client.executeIntent(signed);
     */
    async signIntent(
        intent: BridgingIntent,
        signer: {
            signTypedData(
                domain: Record<string, unknown>,
                // ReadonlyArray accepts both mutable arrays and `as const` tuples
                types:  Record<string, ReadonlyArray<{ readonly name: string; readonly type: string }>>,
                value:  Record<string, unknown>,
            ): Promise<string>;
        }
    ): Promise<BridgingIntent> {
        validateIntent(intent);

        const domain = {
            ...FAROLINK_INTENT_DOMAIN,
            chainId: intent.sourceChainId,
        };

        const value: Record<string, unknown> = {
            sourceUserAddress:      intent.sourceUserAddress,
            destinationUserAddress: intent.destinationUserAddress,
            sourceToken:            intent.sourceToken,
            destinationToken:       intent.destinationToken,
            amountIn:               BigInt(intent.amountIn),
            minAmountOut:           BigInt(intent.minAmountOut),
            sourceChainId:          BigInt(intent.sourceChainId),
            targetChainId:          BigInt(intent.targetChainId),
            deadline:               BigInt(intent.deadline),
        };

        // Note: we do NOT wrap this in wrapAxiosError — if the user rejects
        // the signature in their wallet, that error propagates as-is (not an API error).
        const signature = await signer.signTypedData(domain, FAROLINK_INTENT_TYPES, value);
        return { ...intent, signature };
    }

    /**
     * Submit a signed intent for execution.
     *
     * @param intent  A BridgingIntent with a valid `signature` field (from signIntent())
     * @returns       Execution response with `trackingHash` for status polling
     * @throws        FaroLinkError if signature is missing or the API rejects the intent
     */
    async executeIntent(intent: BridgingIntent): Promise<ExecutionResponse> {
        if (!intent.signature) {
            throw new FaroLinkError(
                'Intent is missing a signature — call signIntent() before executeIntent().',
                undefined,
                'MISSING_SIGNATURE',
            );
        }
        validateIntent(intent);
        try {
            const response = await this.client.post<ExecutionResponse>('/v1/execute', { intent });
            return response.data;
        } catch (err) {
            wrapAxiosError(err);
        }
    }

    /**
     * Get the current delivery status of a submitted intent.
     *
     * @param trackingHash  The `trackingHash` from executeIntent()
     * @returns             Current bridge delivery status
     * @throws              FaroLinkError on API error
     */
    async getStatus(trackingHash: string): Promise<StatusResponse> {
        if (!trackingHash) {
            throw new FaroLinkError('trackingHash is required', undefined, 'INVALID_INPUT');
        }
        try {
            const response = await this.client.get<StatusResponse>(`/v1/status/${trackingHash}`);
            return response.data;
        } catch (err) {
            wrapAxiosError(err);
        }
    }

    /**
     * Poll for delivery confirmation with configurable timeout.
     * Resolves when `status === 'DELIVERED'`, throws on `FAILED` or timeout.
     *
     * @param trackingHash         The `trackingHash` from executeIntent()
     * @param opts.timeoutMs       Max total wait time (default: 5 minutes)
     * @param opts.pollIntervalMs  How often to check (default: 5 seconds)
     * @throws                     FaroLinkError with code 'INTENT_FAILED' or 'TRACKING_TIMEOUT'
     *
     * @example
     * const result = await client.executeIntent(signed);
     * const final  = await client.trackIntent(result.trackingHash!, { timeoutMs: 120_000 });
     * console.log('Delivered at', final.updatedAt);
     */
    async trackIntent(
        trackingHash: string,
        opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
    ): Promise<StatusResponse> {
        const { timeoutMs = 300_000, pollIntervalMs = 5_000 } = opts;
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const status = await this.getStatus(trackingHash);

            if (status.status === 'DELIVERED') return status;

            if (status.status === 'FAILED') {
                throw new FaroLinkError(
                    `Intent failed: ${status.errorMessage ?? 'Unknown error'}`,
                    undefined,
                    'INTENT_FAILED',
                );
            }

            await new Promise(r => setTimeout(r, pollIntervalMs));
        }

        throw new FaroLinkError(
            `Delivery tracking timed out after ${timeoutMs}ms for ${trackingHash}`,
            undefined,
            'TRACKING_TIMEOUT',
        );
    }
}
