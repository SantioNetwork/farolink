# @farolink/sdk

The official TypeScript SDK for routing and executing cross-chain intents on the [Pharos Network](https://farolink.xyz).

## Installation

```bash
npm install @farolink/sdk
# or
yarn add @farolink/sdk
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
    toChain:     688688,     // Pharos
    fromToken:   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',  // USDC on Ethereum
    toToken:     '0x...',                                         // USDC on Pharos
    amountIn:    '1000000',  // 1 USDC (6 decimals)
    userAddress: '0xYourWalletAddress',
});

console.log('Expected output:', quote.expectedOutput);
console.log('Price impact:',    quote.priceImpactBps, 'bps');

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

Returns an optimal route with expected output, gas estimates, and a pre-built `intentPayload` ready to sign.

### `client.signIntent(intent, signer)`

Signs a `BridgingIntent` using EIP-712. The `signer` can be:
- **ethers v6**: `wallet` (has `signTypedData`)
- **viem**: `walletClient` (has `signTypedData`)

Returns the same intent with `signature` populated.

### `client.executeIntent(intent)`

Submits a signed intent to the executor. Returns an `ExecutionResponse` with `trackingHash`.

### `client.getStatus(trackingHash)`

Returns the current `StatusResponse` for a submitted intent.

### `client.trackIntent(trackingHash, opts?)`

Polls until `DELIVERED` or `FAILED`. Throws `FaroLinkError` with `code: 'TRACKING_TIMEOUT'` or `code: 'INTENT_FAILED'` on failure.

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
| `INVALID_INPUT` | Bad address, amount, or missing field |
| `MISSING_SIGNATURE` | Called `executeIntent` without signing first |
| `INTENT_EXPIRED` | Intent deadline has passed |
| `UNAUTHORIZED` | Invalid or missing API key |
| `RATE_LIMITED` | Quota exceeded |
| `INTENT_FAILED` | Bridge delivery failed on destination chain |
| `TRACKING_TIMEOUT` | `trackIntent` timed out before delivery |
| `API_ERROR` | Unexpected server-side error |

## Advanced: Custom Signing

If you need to build your own signing flow, the EIP-712 constants are exported:

```typescript
import { FAROLINK_INTENT_DOMAIN, FAROLINK_INTENT_TYPES } from '@farolink/sdk';

// Build the domain with the correct sourceChainId:
const domain = { ...FAROLINK_INTENT_DOMAIN, chainId: intent.sourceChainId };
const signature = await myCustomSigner.signTypedData(domain, FAROLINK_INTENT_TYPES, intentValue);
```

## License

MIT © FaroLink Labs
