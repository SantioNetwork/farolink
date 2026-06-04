# @farolink/sdk

The official TypeScript SDK for routing and executing cross-chain intents on the [Pharos Network](https://farolink.xyz).

## Installation

```bash
npm install @farolink/sdk
# or
yarn add @farolink/sdk
# or
pnpm add @farolink/sdk
```

## Quick Start

```typescript
import { FaroLinkClient } from '@farolink/sdk';

const client = new FaroLinkClient({
    apiKey: 'your-api-key',   // Get one at https://farolink.xyz/dashboard
});

// 1. Get a quote
const quote = await client.getQuote({
    fromChain:   1,          // Ethereum
    toChain:     688689,     // Pharos Atlantic Testnet
    fromToken:   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',  // USDC on Ethereum
    toToken:     '0x...',                                         // USDC on Pharos
    amountIn:    '1000000',  // 1 USDC (6 decimals)
    userAddress: '0xYourWalletAddress',
});

console.log('Expected output:', quote.expectedOutput);
console.log('Price impact:',    quote.priceImpactBps, 'bps');
console.log('Route score:',     quote.routeScore);

// 2. Sign the intent (works with ethers v6, viem, or any EIP-712-compatible signer)
const signed = await client.signIntent(quote.intentPayload!, ethersSigner);

// 3. Execute
const result = await client.executeIntent(signed);

// 4. Track delivery
const final = await client.trackIntent(result.trackingHash!, {
    timeoutMs:      120_000,  // 2 minutes
    pollIntervalMs: 3_000,    // poll every 3s
});
console.log('Delivered at', final.updatedAt);
```

## API

### `new FaroLinkClient(config?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | — | Enterprise API key for higher rate limits |
| `apiUrl` | `string` | `https://api.farolink.xyz` | Override the API base URL |
| `timeoutMs` | `number` | `30000` | Per-request timeout in milliseconds |

### `client.getQuote(request)`

Returns an optimal route with expected output, gas estimates, route quality score, MEV risk assessment, and a pre-built `intentPayload` ready to sign (when `userAddress` is provided).

**Request fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `fromChain` | `number` | ✓ | Source chain ID |
| `toChain` | `number` | ✓ | Destination chain ID |
| `fromToken` | `string` | ✓ | Source token address (0x-prefixed) |
| `toToken` | `string` | ✓ | Destination token address (0x-prefixed) |
| `amountIn` | `string` | ✓ | Amount in wei as a decimal string |
| `slippageToleranceBps` | `number` | — | Max slippage in bps (default: 50 = 0.5%) |
| `userAddress` | `string` | — | Sender address (required for intentPayload) |
| `destinationUserAddress` | `string` | — | Recipient address if different from sender |

### `client.signIntent(intent, signer)`

Signs a `BridgingIntent` using EIP-712. The `signer` can be:
- **ethers v6**: `wallet` (has `signTypedData`)
- **viem**: `walletClient` (has `signTypedData`)

Returns the same intent with `signature` populated.

### `client.executeIntent(intent)`

Submits a signed intent to the executor. Returns an `ExecutionResponse` with `trackingHash`.

### `client.getStatus(trackingHash)`

Returns the current `StatusResponse` for a submitted intent. The `trackingHash` must be a valid 0x-prefixed 64-character hex string.

### `client.trackIntent(trackingHash, opts?)`

Polls until `DELIVERED` or `FAILED`. Supports external cancellation via `AbortSignal`.

| Option | Type | Default | Description |
|---|---|---|---|
| `timeoutMs` | `number` | `300000` | Max total wait time (5 minutes) |
| `pollIntervalMs` | `number` | `5000` | Poll interval (min: 1 second) |
| `signal` | `AbortSignal` | — | Cancel polling externally |

```typescript
// Cancellable tracking example
const controller = new AbortController();
const final = await client.trackIntent(hash, {
    timeoutMs: 120_000,
    signal: controller.signal,
});

// Cancel from elsewhere:
controller.abort();
```

### `client.getCompliance(address, chainId?)`

Returns KYC/AML compliance data for a wallet address on a specific chain.

```typescript
const compliance = await client.getCompliance('0xYourAddress', 688689);
console.log(compliance.isKYCed, compliance.amlRisk);
```

### `client.getHealth()`

Returns API infrastructure health status (API gateway, database, Redis).

## Error Handling

All errors are instances of `FaroLinkError`:

```typescript
import { FaroLinkClient, FaroLinkError } from '@farolink/sdk';

try {
    await client.executeIntent(intent);
} catch (err) {
    if (err instanceof FaroLinkError) {
        console.error(err.message);      // Human-readable message
        console.error(err.statusCode);   // HTTP status (e.g. 429)
        console.error(err.code);         // Machine-readable code (e.g. 'RATE_LIMITED')
    }
}
```

Common error codes:

| Code | Meaning |
|---|---|
| `INVALID_INPUT` | Bad address, amount, chain ID, or missing field |
| `INVALID_SIGNATURE` | Signer returned a malformed signature |
| `MISSING_SIGNATURE` | Called `executeIntent` without signing first |
| `INTENT_EXPIRED` | Intent deadline has already passed |
| `UNAUTHORIZED` | Invalid or missing API key |
| `RATE_LIMITED` | Quota exceeded |
| `NOT_FOUND` | Resource not found (e.g. no status for tracking hash) |
| `REPLAY_REJECTED` | Intent was already executed (409) |
| `INTENT_FAILED` | Bridge delivery failed on destination chain |
| `TRACKING_TIMEOUT` | `trackIntent` timed out before delivery |
| `TRACKING_ABORTED` | `trackIntent` was cancelled via AbortSignal |
| `SERVER_ERROR` | Unexpected server-side error (5xx) |
| `SDK_ERROR` | Unexpected SDK-side error |

## Advanced: Custom Signing

If you need to build your own signing flow, the EIP-712 constants are exported:

```typescript
import { FAROLINK_INTENT_DOMAIN, FAROLINK_INTENT_TYPES } from '@farolink/sdk';

// Build the domain with the correct sourceChainId:
const domain = { ...FAROLINK_INTENT_DOMAIN, chainId: intent.sourceChainId };
const signature = await myCustomSigner.signTypedData(domain, FAROLINK_INTENT_TYPES, intentValue);
```

## Supported Chains

| Chain | ID |
|---|---|
| Pharos Atlantic Testnet | `688689` |
| Ethereum | `1` |
| Base | `8453` |
| Arbitrum | `42161` |
| Optimism | `10` |
| Polygon | `137` |
| BNB Chain | `56` |

## License

MIT © FaroLink Labs
