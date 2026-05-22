import React from 'react';
import { ArrowRight, Clock, Zap } from 'lucide-react';

interface HopToken { symbol: string; }
interface Hop {
    venue:           string;
    fromToken?:      HopToken;
    toToken?:        HopToken;
    latencyMs?:      number;
    slippageBps?:    number;
    estimatedOutput: string;
}

interface RouteVisualizerProps {
    hops: Hop[];
}

const VENUE_STYLES: Record<string, { color: string; label: string }> = {
    'debridge':       { color: '#10b981', label: 'deBridge'   },
    'layerzero':      { color: '#8b5cf6', label: 'LayerZero'  },
    'chainlink_ccip': { color: '#f59e0b', label: 'CCIP'       },
    'chainlink-ccip': { color: '#f59e0b', label: 'CCIP'       },
    'circle_cctp':    { color: '#3b82f6', label: 'CCTP'       },
    'circle-cctp':    { color: '#3b82f6', label: 'CCTP'       },
    'axelar':         { color: '#06b6d4', label: 'Axelar'     },
    'wormhole':       { color: '#ec4899', label: 'Wormhole'   },
    'pharos-native':  { color: '#f97316', label: 'Pharos SPN' },
    'pharos_spn':     { color: '#f97316', label: 'Pharos SPN' },
    'dex_pool':       { color: '#64748b', label: 'DEX'        },
};

export default function RouteVisualizer({ hops }: RouteVisualizerProps) {
    if (!hops || hops.length === 0) return null;

    const totalLatencyMs = hops.reduce((acc, h) => acc + (h.latencyMs ?? 0), 0);
    const totalLatencySec = (totalLatencyMs / 1000).toFixed(0);

    return (
        <div style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: '0.8rem', color: '#64748b' }}>
                <span style={{ fontWeight: 600, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.72rem' }}>
                    Optimal Route
                </span>
                <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Zap size={12} color="#f59e0b" />
                        {hops.length} hop{hops.length > 1 ? 's' : ''}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} color="#94a3b8" />
                        ~{totalLatencySec}s
                    </span>
                </div>
            </div>

            {/* Hop Chain */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                {/* First token */}
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#e2e8f0' }}>
                    {hops[0]?.fromToken?.symbol ?? '?'}
                </span>

                {hops.map((hop, i) => {
                    const style = VENUE_STYLES[hop.venue] ?? { color: '#64748b', label: hop.venue };
                    return (
                        <React.Fragment key={i}>
                            {/* Venue Badge */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                <ArrowRight size={14} color="#334155" />
                                <span style={{
                                    fontSize: '0.68rem',
                                    padding: '2px 8px',
                                    borderRadius: 20,
                                    background: `${style.color}18`,
                                    color: style.color,
                                    border: `1px solid ${style.color}33`,
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                }}>
                                    {style.label}
                                </span>
                            </div>

                            {/* Output Token */}
                            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#e2e8f0' }}>
                                {hop.toToken?.symbol ?? '?'}
                            </span>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}
