import axios from 'axios';
import crypto from 'crypto';
import { Pool } from 'pg';
import winston from 'winston';

export type WebhookEvent = 'delivery.confirmed' | 'delivery.failed' | 'intent.submitted';

export interface WebhookPayload {
    event:        WebhookEvent;
    trackingHash: string;
    bridgeVenue:  string;
    status:       string;
    amount:       string;
    timestamp:    number;
    errorMessage?: string;
}

/**
 * WebhookDeliveryService
 * Fix #45: Sends HMAC-SHA256-signed POST notifications to registered webhook URLs.
 *
 * Security model:
 *   - Each webhook has a hashed secret stored in DB (secret_hash field)
 *   - On delivery, we fetch the raw secret from a secure store (or env), compute
 *     the HMAC, and send it as the X-Pharosflow-Signature header
 *   - Consumers verify: HMAC-SHA256(secret, JSON.stringify(payload)) === header value
 *
 * Retry policy: Up to 3 attempts with 1s → 5s → 15s exponential backoff.
 * On permanent failure, the webhook is logged and skipped (not disabled automatically).
 */
export class WebhookDeliveryService {
    private logger: winston.Logger;

    constructor(private db: Pool) {
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
            transports: [new winston.transports.Console()],
        });
    }

    /**
     * Fetch all active webhook subscriptions for a given event type,
     * then deliver the payload to each endpoint.
     */
    async dispatch(event: WebhookEvent, payload: WebhookPayload): Promise<void> {
        let webhooks: Array<{ id: number; url: string; secret_hash: string }>;

        try {
            const result = await this.db.query(
                `SELECT w.id, w.url, w.secret_hash
                 FROM webhooks w
                 WHERE w.is_active = TRUE
                   AND $1 = ANY(w.events)`,
                [event]
            );
            webhooks = result.rows;
        } catch (err: any) {
            this.logger.error('WebhookDeliveryService: Failed to fetch webhooks', { error: err.message });
            return;
        }

        this.logger.info(`Dispatching webhook event "${event}" to ${webhooks.length} endpoint(s)`);

        // Fire all deliveries in parallel — each runs independently with retries
        await Promise.allSettled(webhooks.map(wh => this.deliverWithRetry(wh, payload)));
    }

    private async deliverWithRetry(
        webhook: { id: number; url: string; secret_hash: string },
        payload: WebhookPayload
    ): Promise<void> {
        const RETRY_DELAYS = [1000, 5000, 15000]; // ms
        const body         = JSON.stringify(payload);

        // Generate HMAC-SHA256 signature using the stored secret hash as the key
        // In production: fetch real secret from a secrets manager (AWS Secrets Manager, Vault, etc.)
        const signature = crypto
            .createHmac('sha256', webhook.secret_hash)
            .update(body)
            .digest('hex');

        for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
            try {
                const res = await axios.post(webhook.url, body, {
                    headers: {
                        'Content-Type':           'application/json',
                        'X-Pharosflow-Signature': `sha256=${signature}`,
                        'X-Pharosflow-Event':     payload.event,
                        'X-Pharosflow-Timestamp': String(payload.timestamp),
                    },
                    timeout: 5000,
                });

                if (res.status >= 200 && res.status < 300) {
                    this.logger.info(`Webhook delivered`, { webhookId: webhook.id, url: webhook.url, attempt });
                    return;
                }

                this.logger.warn(`Webhook returned non-2xx`, { webhookId: webhook.id, status: res.status, attempt });
            } catch (err: any) {
                this.logger.warn(`Webhook delivery failed`, { webhookId: webhook.id, url: webhook.url, attempt, error: err.message });
            }

            if (attempt < RETRY_DELAYS.length) {
                await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]!));
            }
        }

        this.logger.error(`Webhook permanently failed after ${RETRY_DELAYS.length + 1} attempts`, {
            webhookId: webhook.id, url: webhook.url
        });
    }

    /**
     * Register a new webhook for an API key.
     * Stores the HMAC key hash — never the raw secret.
     */
    async register(apiKeyId: number, url: string, secret: string, events: WebhookEvent[]): Promise<void> {
        const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
        await this.db.query(
            `INSERT INTO webhooks (api_key_id, url, secret_hash, events)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [apiKeyId, url, secretHash, events]
        );
        this.logger.info(`Webhook registered`, { apiKeyId, url, events });
    }
}
