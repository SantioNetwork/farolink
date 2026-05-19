import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { CheckCircle2, Clock, Loader, XCircle, ExternalLink } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type StatusValue = 'PENDING' | 'BROADCASTING' | 'CONFIRMED' | 'DELIVERED' | 'FAILED' | string;

interface StatusData {
    trackingHash:       string;
    status:             StatusValue;
    bridgeVenue?:       string;
    sourceChainId?:     number;
    destinationChainId?: number;
    amount?:            string;
    errorMessage?:      string;
    updatedAt?:         string;
}

const STEPS: { key: StatusValue; label: string }[] = [
    { key: 'PENDING',      label: 'Intent submitted'         },
    { key: 'BROADCASTING', label: 'Broadcasting to network'  },
    { key: 'CONFIRMED',    label: 'Source chain confirmed'   },
    { key: 'DELIVERED',    label: 'Delivered on destination' },
];

function stepIndex(status: StatusValue) {
    const i = STEPS.findIndex(s => s.key === status);
    return i === -1 ? 0 : i;
}

interface Props {
    trackingHash: string;
    txHash?:      string;
}

export default function StatusTracker({ trackingHash, txHash }: Props) {
    const [data,    setData]    = useState<StatusData | null>(null);
    const [failed,  setFailed]  = useState(false);
    const [loading, setLoading] = useState(true);

    const poll = useCallback(async () => {
        try {
            const res = await axios.get<StatusData>(
                `${API_URL}/v1/status/${trackingHash}`,
                { timeout: 8000 }
            );
            setData(res.data);
            setFailed(false);
            return res.data.status;   // Return status so caller can check finality
        } catch {
            // Silently retry — 404 just means not indexed yet
        } finally {
            setLoading(false);
        }
        return null;
    }, [trackingHash]);

    useEffect(() => {
        let cancelled = false;

        // Poll immediately on mount, then set up interval only if not yet final
        const startPolling = async () => {
            const status = await poll();
            if (cancelled) return;

            const isFinal = status === 'DELIVERED' || status === 'FAILED';
            if (isFinal) return;   // Don't start interval if already done

            const interval = setInterval(async () => {
                const s = await poll();
                if (s === 'DELIVERED' || s === 'FAILED') {
                    clearInterval(interval);
                }
            }, 5000);

            return () => clearInterval(interval);
        };

        const cleanup = startPolling();
        return () => {
            cancelled = true;
            cleanup.then(fn => fn?.());
        };
    }, [poll]);

    const current  = data?.status ?? 'PENDING';
    const curIndex = stepIndex(current);
    const isFailed = current === 'FAILED';

    return (
        <div className="status-tracker">
            <div className="status-tracker-title">
                {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Loader size={12} className="spinning" /> Fetching status…
                    </span>
                ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between', width: '100%' }}>
                        <span>Bridge Status</span>
                        {data?.bridgeVenue && (
                            <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: 'var(--text-2)' }}>
                                via {data.bridgeVenue}
                            </span>
                        )}
                    </span>
                )}
            </div>

            {/* Step indicators */}
            <div>
                {STEPS.map((step, i) => {
                    const done   = i < curIndex || current === 'DELIVERED';
                    const active = i === curIndex && !isFailed;
                    const dotCls = done ? 'status-dot done' : active ? 'status-dot active' : 'status-dot pending';

                    return (
                        <div key={step.key} className="status-step">
                            <span className={dotCls} />
                            <span style={{ color: done || active ? 'var(--text-1)' : 'var(--text-4)', transition: 'color 0.3s' }}>
                                {step.label}
                            </span>
                            {done && <CheckCircle2 size={13} color="var(--success)" style={{ marginLeft: 'auto' }} />}
                            {active && <Loader size={13} className="spinning" style={{ marginLeft: 'auto', color: 'var(--accent)' }} />}
                        </div>
                    );
                })}

                {isFailed && (
                    <div className="status-step" style={{ color: 'var(--danger)', marginTop: 4 }}>
                        <XCircle size={14} color="var(--danger)" />
                        {data?.errorMessage ?? 'Transaction failed'}
                    </div>
                )}
            </div>

            {/* Explorer link */}
            {txHash && (
                <a
                    href={`https://testnet.pharosscan.io/tx/${txHash}`}
                    target="_blank" rel="noreferrer"
                    style={{
                        display:     'flex',
                        alignItems:  'center',
                        gap:          4,
                        marginTop:    12,
                        fontSize:    '0.78rem',
                        color:       'var(--text-3)',
                        paddingTop:   12,
                        borderTop:   '1px solid var(--border)',
                    }}
                >
                    <ExternalLink size={11} /> View on PharosScan
                </a>
            )}
        </div>
    );
}
