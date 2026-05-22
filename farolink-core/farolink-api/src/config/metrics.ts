import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

/**
 * FaroLink Prometheus Metrics
 * Fix #36: Provides observability for the API gateway via /metrics endpoint.
 *
 * Collected metrics:
 *   - farolink_quote_requests_total    (counter by status)
 *   - farolink_execute_requests_total  (counter by status)
 *   - farolink_route_latency_ms        (histogram)
 *   - farolink_active_intents          (gauge)
 *   - farolink_bridge_events_total     (counter by venue and status)
 *   - Default Node.js process metrics    (CPU, memory, event loop)
 */

export const metricsRegistry = new Registry();

// Collect default Node.js process metrics (CPU, memory, GC, event loop lag)
collectDefaultMetrics({ register: metricsRegistry });

export const quoteRequestsTotal = new Counter({
    name:    'farolink_quote_requests_total',
    help:    'Total number of /v1/quote requests',
    labelNames: ['status'] as const,  // 'success' | 'error' | 'no_route'
    registers: [metricsRegistry],
});

export const executeRequestsTotal = new Counter({
    name:    'farolink_execute_requests_total',
    help:    'Total number of /v1/execute requests',
    labelNames: ['status'] as const,  // 'success' | 'error' | 'invalid'
    registers: [metricsRegistry],
});

export const routeLatencyHistogram = new Histogram({
    name:    'farolink_route_latency_ms',
    help:    'Latency of /v1/quote route computation in milliseconds',
    buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
    registers: [metricsRegistry],
});

export const activeIntentsGauge = new Gauge({
    name:    'farolink_active_intents',
    help:    'Number of intents currently in PENDING or BROADCASTING state',
    registers: [metricsRegistry],
});

export const bridgeEventsTotal = new Counter({
    name:    'farolink_bridge_events_total',
    help:    'Total bridge events by venue and delivery status',
    labelNames: ['venue', 'status'] as const,
    registers: [metricsRegistry],
});

export const apiKeyRequestsTotal = new Counter({
    name:    'farolink_api_key_requests_total',
    help:    'Requests per API key tier',
    labelNames: ['tier'] as const,  // 'free' | 'builder' | 'pro' | 'enterprise'
    registers: [metricsRegistry],
});
