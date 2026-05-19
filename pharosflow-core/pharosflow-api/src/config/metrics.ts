import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

/**
 * PharosFlow Prometheus Metrics
 * Fix #36: Provides observability for the API gateway via /metrics endpoint.
 *
 * Collected metrics:
 *   - pharosflow_quote_requests_total    (counter by status)
 *   - pharosflow_execute_requests_total  (counter by status)
 *   - pharosflow_route_latency_ms        (histogram)
 *   - pharosflow_active_intents          (gauge)
 *   - pharosflow_bridge_events_total     (counter by venue and status)
 *   - Default Node.js process metrics    (CPU, memory, event loop)
 */

export const metricsRegistry = new Registry();

// Collect default Node.js process metrics (CPU, memory, GC, event loop lag)
collectDefaultMetrics({ register: metricsRegistry });

export const quoteRequestsTotal = new Counter({
    name:    'pharosflow_quote_requests_total',
    help:    'Total number of /v1/quote requests',
    labelNames: ['status'] as const,  // 'success' | 'error' | 'no_route'
    registers: [metricsRegistry],
});

export const executeRequestsTotal = new Counter({
    name:    'pharosflow_execute_requests_total',
    help:    'Total number of /v1/execute requests',
    labelNames: ['status'] as const,  // 'success' | 'error' | 'invalid'
    registers: [metricsRegistry],
});

export const routeLatencyHistogram = new Histogram({
    name:    'pharosflow_route_latency_ms',
    help:    'Latency of /v1/quote route computation in milliseconds',
    buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
    registers: [metricsRegistry],
});

export const activeIntentsGauge = new Gauge({
    name:    'pharosflow_active_intents',
    help:    'Number of intents currently in PENDING or BROADCASTING state',
    registers: [metricsRegistry],
});

export const bridgeEventsTotal = new Counter({
    name:    'pharosflow_bridge_events_total',
    help:    'Total bridge events by venue and delivery status',
    labelNames: ['venue', 'status'] as const,
    registers: [metricsRegistry],
});

export const apiKeyRequestsTotal = new Counter({
    name:    'pharosflow_api_key_requests_total',
    help:    'Requests per API key tier',
    labelNames: ['tier'] as const,  // 'free' | 'builder' | 'pro' | 'enterprise'
    registers: [metricsRegistry],
});
