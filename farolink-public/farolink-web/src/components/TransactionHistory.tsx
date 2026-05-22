import React, { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, Clock } from 'lucide-react';
import { z } from 'zod';

export interface TxRecord {
    id:           string;   // UUID
    fromSymbol:   string;
    toSymbol:     string;
    fromChainId:  number;
    toChainId:    number;
    amountIn:     string;
    trackingHash: string;
    txHash?:      string;
    status:       'pending' | 'broadcasting' | 'confirmed' | 'delivered' | 'failed';
    venue?:       string;
    timestamp:    number;
}

// Fix M-4: Zod schema validates every record from localStorage before use.
// Prevents XSS or extension-injected data from reaching React state.
const TxRecordSchema = z.object({
    id:           z.string().uuid(),
    fromSymbol:   z.string().min(1).max(20),
    toSymbol:     z.string().min(1).max(20),
    fromChainId:  z.number().int().positive(),
    toChainId:    z.number().int().positive(),
    amountIn:     z.string().regex(/^\d+$/),
    trackingHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    txHash:       z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
    status:       z.enum(['pending', 'broadcasting', 'confirmed', 'delivered', 'failed']),
    venue:        z.string().max(50).optional(),
    timestamp:    z.number().int().positive(),
});

const CHAIN_NAMES: Record<number, string> = {
    688689: 'Pharos',
    1:      'Ethereum',
    137:    'Polygon',
    42161:  'Arbitrum',
    8453:   'Base',
};

const STORAGE_KEY = 'farolink_tx_history';
const MAX_RECORDS = 50;

// ── LocalStorage helpers ──────────────────────────────────────────────────────
export function saveTx(record: TxRecord): void {
    const existing = loadHistory();
    const updated  = [record, ...existing].slice(0, MAX_RECORDS);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
}

export function updateTxStatus(id: string, status: TxRecord['status']): void {
    const existing = loadHistory();
    const updated  = existing.map(r => r.id === id ? { ...r, status } : r);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
}

export function loadHistory(): TxRecord[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Fix M-4: Validate each record individually — drop invalid ones, keep valid ones.
        const validated: TxRecord[] = [];
        for (const item of parsed) {
            const result = TxRecordSchema.safeParse(item);
            if (result.success) {
                validated.push(result.data as TxRecord);
            } else {
                console.warn('[FaroLink] Dropping invalid TX history record:', result.error.flatten());
            }
        }
        return validated;
    } catch { return []; }
}


function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const m    = Math.floor(diff / 60000);
    const h    = Math.floor(diff / 3600000);
    const d    = Math.floor(diff / 86400000);
    if (d > 0)  return `${d}d ago`;
    if (h > 0)  return `${h}h ago`;
    if (m > 0)  return `${m}m ago`;
    return 'Just now';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TransactionHistory() {
    const [records, setRecords] = useState<TxRecord[]>([]);

    useEffect(() => {
        setRecords(loadHistory());
        // Refresh every 10s while tab is open (picks up status updates)
        const interval = setInterval(() => setRecords(loadHistory()), 10000);
        return () => clearInterval(interval);
    }, []);

    if (records.length === 0) {
        return (
            <div className="history-panel">
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: 12 }}>
                    Transaction History
                </div>
                <div style={{
                    background: 'var(--bg-elevated)',
                    border:     '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding:    '32px 20px',
                    textAlign:  'center',
                    color:      'var(--text-4)',
                    fontSize:   '0.875rem',
                }}>
                    <Clock size={28} color="var(--bg-active)" style={{ marginBottom: 12 }} />
                    <div>No transactions yet</div>
                    <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
                        Your swap history will appear here
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="history-panel">
            <div style={{
                display:        'flex',
                justifyContent: 'space-between',
                alignItems:     'center',
                fontSize:       '0.75rem',
                fontWeight:      600,
                textTransform:  'uppercase',
                letterSpacing:  '0.05em',
                color:          'var(--text-3)',
                marginBottom:    12,
            }}>
                <span>Transaction History</span>
                <button
                    onClick={() => {
                        localStorage.removeItem(STORAGE_KEY);
                        setRecords([]);
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
                >
                    Clear
                </button>
            </div>

            {records.map(r => (
                <div key={r.id} className="history-item">
                    <div>
                        {/* Route label */}
                        <div className="history-route">
                            {r.fromSymbol}
                            <span style={{ color: 'var(--text-3)', margin: '0 4px' }}>
                                <ArrowRight size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                            </span>
                            {r.toSymbol}
                        </div>
                        <div className="history-meta">
                            {CHAIN_NAMES[r.fromChainId] ?? r.fromChainId}
                            {r.fromChainId !== r.toChainId && ` → ${CHAIN_NAMES[r.toChainId] ?? r.toChainId}`}
                            {' · '}
                            {timeAgo(r.timestamp)}
                        </div>
                        {r.txHash && (
                            <a
                                href={`https://testnet.pharosscan.io/tx/${r.txHash}`}
                                target="_blank" rel="noreferrer"
                                style={{ fontSize: '0.72rem', color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 3 }}
                            >
                                <ExternalLink size={10} /> {r.txHash.slice(0, 10)}…
                            </a>
                        )}
                    </div>

                    <span className={`history-status ${r.status}`}>
                        {r.status}
                    </span>
                </div>
            ))}
        </div>
    );
}
