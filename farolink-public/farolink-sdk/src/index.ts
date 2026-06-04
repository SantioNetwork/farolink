import axios, { AxiosInstance, AxiosError } from 'axios';
import {
    RouteRequest, RouteResponse, BridgingIntent,
    ExecutionResponse, StatusResponse, ComplianceResponse,
    ClientConfig, TrackIntentOptions
} from './types';

export * from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** SDK version — exposed for diagnostics and User-Agent headers */
export const SDK_VERSION = '1.1.0';

/** Default API base URL (production) */
const DEFAULT_API_URL = 'https://api.farolink.xyz';

/** Default per-request timeout (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Default tracking poll interval (5 seconds) */
const DEFAULT_POLL_INTERVAL_MS = 5_000;

/** Default tracking timeout (5 minutes) */
const DEFAULT_TRACK_TIMEOUT_MS = 300_000;

/** Minimum acceptable poll interval to prevent API abuse (1 second) */
const MIN_POLL_INTERVAL_MS = 1_000;

/** Maximum deadline window accepted by the API (2 hours) */
const MAX_DEADLINE_WINDOW_SEC = 7200;

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
        // Fix: Ensure `instanceof FaroLinkError` works correctly in all transpilation targets.
        // When targeting ES5, TypeScript's `extends Error` doesn't correctly set the prototype
        // chain, causing `instanceof` checks to fail.
        Object.setPrototypeOf(this, FaroLinkError.prototype);
    }
}

/** Converts an axios error into a structured FaroLinkError */
function wrapAxiosError(err: unknown): never {
    if (axios.isAxiosError(err)) {
        const axErr = err as AxiosError<{ error?: string; code?: string }>;
        const status  = axErr.response?.status;
        const body    = axErr.response?.data;
        const message = body?.error ?? axErr.message;

        let code: string;
        if (body?.code) {
            code = body.code;
        } else if (status === 429) {
            code = 'RATE_LIMITED';
        } else if (status === 401) {
            code = 'UNAUTHORIZED';
        } else if (status === 404) {
            code = 'NOT_FOUND';
        } else if (status === 409) {
            code = 'REPLAY_REJECTED';
        } else if (status !== undefined && status >= 500) {
            code = 'SERVER_ERROR';
        } else {
            code = 'API_ERROR';
        }

        throw new FaroLinkError(message, status, code, body);
    }

    // If it's already a FaroLinkError, re-throw as-is
    if (err instanceof FaroLinkError) {
        throw err;
    }

    // Wrap unknown errors with context
    if (err instanceof Error) {
        throw new FaroLinkError(
            `SDK Error: ${err.message}`,
            undefined,
            'SDK_ERROR',
        );
    }

    throw new FaroLinkError(
        `SDK Error: ${String(err)}`,
        undefined,
        'SDK_ERROR',
    );
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
const HEX_HASH_RE    = /^0x[0-9a-fA-F]{64}$/;

function assertValidAddress(value: string, fieldName: string): void {
    if (!EVM_ADDRESS_RE.test(value)) {
        throw new FaroLinkError(
            `${fieldName} "${value}" is not a valid EVM address (expected 0x + 40 hex chars)`,
            undefined,
            'INVALID_INPUT',
        );
    }
}

function assertValidWeiString(value: string, fieldName: string): void {
    if (!WEI_STRING_RE.test(value)) {
        throw new FaroLinkError(
            `${fieldName} "${value}" must be a non-negative integer as a decimal string (no 0x prefix, no decimals)`,
            undefined,
            'INVALID_INPUT',
        );
    }
}

function assertPositiveChainId(value: number, fieldName: string): void {
    if (!Number.isInteger(value) || value <= 0) {
        throw new FaroLinkError(
            `${fieldName} must be a positive integer, got ${value}`,
            undefined,
            'INVALID_INPUT',
        );
    }
}

function validateRouteRequest(req: RouteRequest): void {
    assertPositiveChainId(req.fromChain, 'RouteRequest.fromChain');
    assertPositiveChainId(req.toChain, 'RouteRequest.toChain');
    assertValidAddress(req.fromToken, 'RouteRequest.fromToken');
    assertValidAddress(req.toToken, 'RouteRequest.toToken');
    assertValidWeiString(req.amountIn, 'RouteRequest.amountIn');

    if (BigInt(req.amountIn) === 0n) {
        throw new FaroLinkError(
            'RouteRequest.amountIn must be greater than zero',
            undefined,
            'INVALID_INPUT',
        );
    }

    if (req.userAddress !== undefined) {
        assertValidAddress(req.userAddress, 'RouteRequest.userAddress');
    }

    if (req.destinationUserAddress !== undefined) {
        assertValidAddress(req.destinationUserAddress, 'RouteRequest.destinationUserAddress');
    }

    if (req.slippageToleranceBps !== undefined) {
        if (!Number.isInteger(req.slippageToleranceBps) || req.slippageToleranceBps < 0 || req.slippageToleranceBps > 1000) {
            throw new FaroLinkError(
                `RouteRequest.slippageToleranceBps must be an integer between 0 and 1000, got ${req.slippageToleranceBps}`,
                undefined,
                'INVALID_INPUT',
            );
        }
    }
}

function validateIntent(intent: BridgingIntent): void {
    assertValidAddress(intent.sourceUserAddress, 'BridgingIntent.sourceUserAddress');
    assertValidAddress(intent.destinationUserAddress, 'BridgingIntent.destinationUserAddress');
    assertValidAddress(intent.sourceToken, 'BridgingIntent.sourceToken');
    assertValidAddress(intent.destinationToken, 'BridgingIntent.destinationToken');
    assertPositiveChainId(intent.sourceChainId, 'BridgingIntent.sourceChainId');
    assertPositiveChainId(intent.targetChainId, 'BridgingIntent.targetChainId');
    assertValidWeiString(intent.amountIn, 'BridgingIntent.amountIn');
    assertValidWeiString(intent.minAmountOut, 'BridgingIntent.minAmountOut');

    if (BigInt(intent.amountIn) === 0n) {
        throw new FaroLinkError(
            'BridgingIntent.amountIn must be greater than zero',
            undefined,
            'INVALID_INPUT',
        );
    }

    if (BigInt(intent.minAmountOut) === 0n) {
        throw new FaroLinkError(
            'BridgingIntent.minAmountOut must be greater than zero',
            undefined,
            'INVALID_INPUT',
        );
    }

    if (BigInt(intent.minAmountOut) > BigInt(intent.amountIn)) {
        throw new FaroLinkError(
            'BridgingIntent.minAmountOut cannot exceed amountIn',
            undefined,
            'INVALID_INPUT',
        );
    }

    if (!Number.isInteger(intent.deadline) || intent.deadline <= 0) {
        throw new FaroLinkError(
            'BridgingIntent.deadline must be a positive unix timestamp (seconds)',
            undefined,
            'INVALID_INPUT',
        );
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (intent.deadline < nowSec) {
        throw new FaroLinkError(
            `BridgingIntent.deadline has already passed (deadline: ${intent.deadline}, now: ${nowSec})`,
            undefined,
            'INTENT_EXPIRED',
        );
    }

    if (intent.deadline > nowSec + MAX_DEADLINE_WINDOW_SEC) {
        throw new FaroLinkError(
            `BridgingIntent.deadline is too far in the future (max ${MAX_DEADLINE_WINDOW_SEC}s / 2 hours from now)`,
            undefined,
            'INVALID_INPUT',
        );
    }

    if (intent.maxGasFee !== undefined) {
        assertValidWeiString(intent.maxGasFee, 'BridgingIntent.maxGasFee');
        if (BigInt(intent.maxGasFee) === 0n) {
            throw new FaroLinkError(
                'BridgingIntent.maxGasFee must be greater than zero if provided',
                undefined,
                'INVALID_INPUT',
            );
        }
    }
}

function validateTrackingHash(trackingHash: string): void {
    if (!trackingHash || typeof trackingHash !== 'string') {
        throw new FaroLinkError('trackingHash is required', undefined, 'INVALID_INPUT');
    }
    if (!HEX_HASH_RE.test(trackingHash)) {
        throw new FaroLinkError(
            `trackingHash "${trackingHash}" is invalid (expected 0x + 64 hex chars)`,
            undefined,
            'INVALID_INPUT',
        );
    }
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class FaroLinkClient {
    private readonly client: AxiosInstance;
    private readonly apiUrl: string;

    constructor(config: ClientConfig = {}) {
        this.apiUrl = config.apiUrl ?? DEFAULT_API_URL;

        this.client = axios.create({
            baseURL: this.apiUrl,
            timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': `@farolink/sdk/${SDK_VERSION}`,
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
     *     toChain:   688689,
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

        // Validate that the signer returned a well-formed hex signature
        if (typeof signature !== 'string' || !signature.startsWith('0x') || signature.length < 130) {
            throw new FaroLinkError(
                'Signer returned an invalid signature (expected 0x-prefixed hex string, >= 130 chars)',
                undefined,
                'INVALID_SIGNATURE',
            );
        }

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

        // Validate signature format before hitting the network
        if (!intent.signature.startsWith('0x') || intent.signature.length < 130) {
            throw new FaroLinkError(
                'Intent signature is malformed (expected 0x-prefixed hex string, >= 130 chars)',
                undefined,
                'INVALID_SIGNATURE',
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
     * @throws              FaroLinkError on API error or invalid trackingHash format
     */
    async getStatus(trackingHash: string): Promise<StatusResponse> {
        validateTrackingHash(trackingHash);
        try {
            // trackingHash is validated to be 0x + 64 hex chars, safe to interpolate
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
     * Supports external cancellation via `AbortSignal`:
     *
     * @param trackingHash         The `trackingHash` from executeIntent()
     * @param opts.timeoutMs       Max total wait time (default: 5 minutes)
     * @param opts.pollIntervalMs  How often to check (default: 5 seconds, min: 1 second)
     * @param opts.signal          AbortSignal to cancel polling externally
     * @throws                     FaroLinkError with code 'INTENT_FAILED', 'TRACKING_TIMEOUT', or 'TRACKING_ABORTED'
     *
     * @example
     * const result = await client.executeIntent(signed);
     * const final  = await client.trackIntent(result.trackingHash!, { timeoutMs: 120_000 });
     * console.log('Delivered at', final.updatedAt);
     *
     * @example
     * // Cancellable tracking
     * const controller = new AbortController();
     * setTimeout(() => controller.abort(), 60_000);  // cancel after 1 minute
     * const final = await client.trackIntent(hash, { signal: controller.signal });
     */
    async trackIntent(
        trackingHash: string,
        opts: TrackIntentOptions = {},
    ): Promise<StatusResponse> {
        validateTrackingHash(trackingHash);

        const {
            timeoutMs     = DEFAULT_TRACK_TIMEOUT_MS,
            pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
            signal,
        } = opts;

        // Enforce minimum poll interval to prevent API abuse
        const clampedInterval = Math.max(pollIntervalMs, MIN_POLL_INTERVAL_MS);

        if (timeoutMs <= 0) {
            throw new FaroLinkError(
                'trackIntent: timeoutMs must be a positive number',
                undefined,
                'INVALID_INPUT',
            );
        }

        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            // Check for external abort
            if (signal?.aborted) {
                throw new FaroLinkError(
                    'Intent tracking was cancelled',
                    undefined,
                    'TRACKING_ABORTED',
                );
            }

            const status = await this.getStatus(trackingHash);

            if (status.status === 'DELIVERED') return status;

            if (status.status === 'FAILED') {
                throw new FaroLinkError(
                    `Intent failed: ${status.errorMessage ?? 'Unknown error'}`,
                    undefined,
                    'INTENT_FAILED',
                );
            }

            // Wait for the poll interval, but also listen for abort
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, clampedInterval);

                if (signal) {
                    const onAbort = () => {
                        clearTimeout(timer);
                        reject(new FaroLinkError(
                            'Intent tracking was cancelled',
                            undefined,
                            'TRACKING_ABORTED',
                        ));
                    };

                    if (signal.aborted) {
                        clearTimeout(timer);
                        reject(new FaroLinkError(
                            'Intent tracking was cancelled',
                            undefined,
                            'TRACKING_ABORTED',
                        ));
                        return;
                    }

                    signal.addEventListener('abort', onAbort, { once: true });

                    // Clean up the listener when the timer fires normally
                    const originalResolve = resolve;
                    resolve = (() => {
                        signal.removeEventListener('abort', onAbort);
                        originalResolve();
                    }) as () => void;
                }
            });
        }

        throw new FaroLinkError(
            `Delivery tracking timed out after ${timeoutMs}ms for ${trackingHash}`,
            undefined,
            'TRACKING_TIMEOUT',
        );
    }

    /**
     * Get compliance/KYC data for a wallet address on a specific chain.
     *
     * @param address  EVM wallet address to check
     * @param chainId  Chain ID to check compliance for (default: 1 = Ethereum)
     * @returns        Compliance status including KYC, AML risk, and RWA flags
     * @throws         FaroLinkError on API error or if no compliance data exists
     *
     * @example
     * const compliance = await client.getCompliance('0xYourAddress', 688689);
     * if (compliance.isKYCed && compliance.amlRisk === 'low') {
     *     // proceed with RWA routes
     * }
     */
    async getCompliance(address: string, chainId: number = 1): Promise<ComplianceResponse> {
        assertValidAddress(address, 'address');
        assertPositiveChainId(chainId, 'chainId');
        try {
            const response = await this.client.get<ComplianceResponse>(
                `/v1/compliance/${address}`,
                { params: { chainId } },
            );
            return response.data;
        } catch (err) {
            wrapAxiosError(err);
        }
    }

    /**
     * Check API and infrastructure health.
     *
     * @returns Health status object
     * @throws  FaroLinkError on network error
     */
    async getHealth(): Promise<{ status: string; apiGateway: string; db: string; redis: string }> {
        try {
            const response = await this.client.get<{
                status: string;
                apiGateway: string;
                db: string;
                redis: string;
            }>('/health');
            return response.data;
        } catch (err) {
            wrapAxiosError(err);
        }
    }
}
