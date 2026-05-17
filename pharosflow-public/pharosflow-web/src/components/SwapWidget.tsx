import React, { useState, useEffect, useCallback } from 'react';
import { Settings, ArrowDown, ChevronDown, Rocket, ShieldCheck, RefreshCw, AlertCircle, CheckCircle2, ExternalLink, AlertTriangle } from 'lucide-react';
import { useAccount, useSignTypedData, useChainId } from 'wagmi';
import axios from 'axios';
import TokenModal from './TokenModal';
import RouteVisualizer from './RouteVisualizer';
import StatusTracker from './StatusTracker';
import { saveTx } from './TransactionHistory';
import type { TokenInfo } from '../lib/tokenList';
import { TOKENS, formatUSD, fetchLivePrices } from '../lib/tokenList';

const CHAIN_NAMES: Record<number, string> = {
  688689: 'Pharos', 1: 'Ethereum', 42161: 'Arbitrum',
  10: 'Optimism', 8453: 'Base', 137: 'Polygon', 56: 'BSC',
};

// Note: crypto.randomUUID() is available in all modern browsers (Chrome 92+, FF 95+, Safari 15.4+)
// No import needed — it's on the global `crypto` object.


const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const DEFAULT_FROM = TOKENS.find(t => t.symbol === 'WETH' && t.chainId === 688689) ?? TOKENS[0]!;
const DEFAULT_TO   = TOKENS.find(t => t.symbol === 'USDC' && t.chainId === 688689) ?? TOKENS[1]!;

type Step = 'idle' | 'quoting' | 'quoted' | 'signing' | 'executing' | 'done' | 'error';

interface QuoteData {
    amountIn:          string;
    expectedOutput:    string;
    totalGasEstimated: string;
    priceImpactBps:    number;
    hops:              any[];
    intentPayload?:    any;
}

const INTENT_DOMAIN = { name: 'PharosFlow', version: '1' } as const;
const INTENT_TYPES = {
    BridgingIntent: [
        { name: 'sourceUserAddress',      type: 'address' },
        { name: 'destinationUserAddress', type: 'address' },
        { name: 'sourceToken',            type: 'address' },
        { name: 'destinationToken',       type: 'address' },
        { name: 'amountIn',               type: 'uint256' },
        { name: 'minAmountOut',           type: 'uint256' },
        // Fix M-6: sourceChainId must be in the signed message (chain where user signs)
        { name: 'sourceChainId',          type: 'uint256' },
        { name: 'targetChainId',          type: 'uint256' },
        { name: 'deadline',               type: 'uint256' },
    ]
} as const;

export default function SwapWidget() {
    const { address, isConnected }  = useAccount();
    const chainId                   = useChainId();
    const { signTypedDataAsync }    = useSignTypedData();

    const [amount,       setAmount]       = useState('');
    const [fromToken,    setFromToken]    = useState<TokenInfo>(DEFAULT_FROM);
    const [toToken,      setToToken]      = useState<TokenInfo>(DEFAULT_TO);
    const [step,         setStep]         = useState<Step>('idle');
    const [quote,        setQuote]        = useState<QuoteData | null>(null);
    const [txHash,       setTxHash]       = useState('');
    const [trackingHash, setTrackingHash] = useState('');
    const [error,        setError]        = useState('');
    const [modalTarget,  setModalTarget]  = useState<'from' | 'to' | null>(null);
    const [slippage,     setSlippage]     = useState(50);
    const [showSettings, setShowSettings] = useState(false);
    const [prices,       setPrices]       = useState<Record<string, number>>({});
    const [highImpactAck, setHighImpactAck] = useState(false);

    // Fix B3: Fetch live prices on mount and every 60s
    useEffect(() => {
        fetchLivePrices().then(setPrices);
        const interval = setInterval(() => fetchLivePrices().then(setPrices), 60_000);
        return () => clearInterval(interval);
    }, []);

    // Auto-quote debounce
    useEffect(() => {
        if (!amount || parseFloat(amount) <= 0 || !isConnected) return;
        const timer = setTimeout(() => handleGetQuote(), 800);
        return () => clearTimeout(timer);
    }, [amount, fromToken, toToken]);

    const reset = () => {
        setStep('idle'); setQuote(null); setError('');
        setTxHash(''); setTrackingHash(''); setHighImpactAck(false);
    };

    const handleSwapTokens = () => {
        setFromToken(toToken); setToToken(fromToken); reset();
    };

    const handleGetQuote = useCallback(async () => {
        if (!amount || parseFloat(amount) <= 0) return;
        setStep('quoting'); setError(''); setHighImpactAck(false);
        try {
            const amountIn = BigInt(Math.round(parseFloat(amount) * 10 ** fromToken.decimals)).toString();
            const res = await axios.post<QuoteData>(`${API_URL}/v1/quote`, {
                fromChain:            fromToken.chainId,
                toChain:              toToken.chainId,
                fromToken:            fromToken.address,
                toToken:              toToken.address,
                amountIn,
                slippageToleranceBps: slippage,
                userAddress:          address,
            }, { timeout: 15000 });
            setQuote(res.data);
            setStep('quoted');
        } catch (err: any) {
            setError(err.response?.data?.error ?? err.message ?? 'Failed to fetch quote');
            setStep('error');
        }
    }, [amount, fromToken, toToken, slippage, address]);

    const handleExecute = async () => {
        if (!quote?.intentPayload || !address) return;
        setStep('signing');
        try {
            const deadline = Math.floor(Date.now() / 1000) + 1800;
            const intentMessage = {
                ...quote.intentPayload,
                sourceUserAddress:      address,
                destinationUserAddress: address,
                // Fix M-6: sourceChainId is the chain the user is currently on (where they sign)
                sourceChainId:          chainId,
                deadline,
            };
            const sig = await signTypedDataAsync({
                account:     address,
                // Fix: use wagmi's chainId (current connected chain) not fromToken.chainId
                // These can differ if the user switches network after selecting tokens
                domain:      { ...INTENT_DOMAIN, chainId },
                types:       INTENT_TYPES,
                primaryType: 'BridgingIntent',
                message:     intentMessage,
            });

            setStep('executing');
            const execRes = await axios.post(`${API_URL}/v1/execute`, {
                intent: { ...intentMessage, signature: sig }
            }, { timeout: 30000 });

            const hash    = execRes.data.intentHash ?? execRes.data.txHash ?? '';
            const tracking = execRes.data.trackingHash ?? hash;
            setTxHash(hash);
            setTrackingHash(tracking);
            setStep('done');

            // Fix M1: Save to localStorage history
            // amountIn stored as wei string for consistency with executor records
            const amountInWei = BigInt(Math.round(parseFloat(amount) * 10 ** fromToken.decimals)).toString();
            saveTx({
                id:           crypto.randomUUID(),
                fromSymbol:   fromToken.symbol,
                toSymbol:     toToken.symbol,
                fromChainId:  fromToken.chainId,
                toChainId:    toToken.chainId,
                amountIn:     amountInWei,
                trackingHash: tracking,
                txHash:       hash,
                status:       'pending',
                venue:        quote.hops?.[0]?.venue,
                timestamp:    Date.now(),
            });
        } catch (err: any) {
            setError(err.response?.data?.error ?? err.message ?? 'Execution failed');
            setStep('error');
        }
    };

    // ── Derived ───────────────────────────────────────────────────────────────
    const isLoading     = ['quoting', 'signing', 'executing'].includes(step);
    const outputAmount  = quote
        ? (Number(BigInt(quote.expectedOutput)) / 10 ** toToken.decimals).toFixed(6)
        : '';
    const impactBps     = quote?.priceImpactBps ?? 0;
    const impactHigh    = impactBps > 200;   // > 2% — dangerous
    const impactMedium  = impactBps > 100;   // > 1% — warn
    const canExecute    = step === 'quoted' && (!impactHigh || highImpactAck);

    const amountWei = amount
        ? BigInt(Math.round(parseFloat(amount) * 10 ** fromToken.decimals)).toString()
        : '0';

    const fromUSD  = amount && parseFloat(amount) > 0
        ? formatUSD(amountWei, fromToken.decimals, fromToken.symbol, prices)
        : '';
    const toUSD    = outputAmount
        ? formatUSD(quote?.expectedOutput ?? '0', toToken.decimals, toToken.symbol, prices)
        : '';

    return (
        <>
            <TokenModal
                isOpen={modalTarget !== null}
                onClose={() => setModalTarget(null)}
                excluded={modalTarget === 'from' ? toToken.address : fromToken.address}
                onSelect={token => {
                    if (modalTarget === 'from') setFromToken(token);
                    else                        setToToken(token);
                    setModalTarget(null); reset();
                }}
            />

            <div className="glass-panel" style={{ width: '100%', maxWidth: '480px' }}>

                {/* ── Header ─────────────────────────────────────────────── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-1)' }}>
                            Swap
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 2 }}>
                            Intent-based cross-chain routing
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {/* MEV badge */}
                        <span style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)', fontWeight: 600 }}>
                            MEV Protected
                        </span>
                        <button
                            id="swap-settings-btn"
                            onClick={() => setShowSettings(s => !s)}
                            style={{ background: 'none', border: 'none', color: showSettings ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', transition: 'color 0.15s' }}
                        >
                            <Settings size={17} />
                        </button>
                    </div>
                </div>

                {/* ── Settings ───────────────────────────────────────────── */}
                {showSettings && (
                    <div className="settings-panel">
                        <div className="settings-label">Slippage Tolerance</div>
                        <div className="slippage-options">
                            {[25, 50, 100].map(bps => (
                                <button
                                    key={bps}
                                    className={`slippage-btn ${slippage === bps ? 'active' : ''}`}
                                    onClick={() => setSlippage(bps)}
                                >
                                    {(bps / 100).toFixed(2)}%
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── From Input ─────────────────────────────────────────── */}
                <div className="input-group">
                    <div className="input-header">
                        <span>You pay</span>
                        <span>{fromUSD}</span>
                    </div>
                    <div className="input-row">
                        <input
                            id="swap-amount-input"
                            type="number"
                            className="token-input"
                            placeholder="0"
                            value={amount}
                            min="0"
                            onChange={e => { setAmount(e.target.value); reset(); }}
                        />
                        <button id="from-token-selector" className="token-selector" onClick={() => setModalTarget('from')}>
                            <img
                                src={fromToken.logoURI}
                                alt={fromToken.symbol}
                                width={22} height={22}
                                style={{ borderRadius: '50%' }}
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <span>{fromToken.symbol}</span>
                            <span style={{ fontSize: '0.65rem', padding: '1px 5px', background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', borderRadius: 8, fontWeight: 500 }}>
                                {CHAIN_NAMES[fromToken.chainId] ?? fromToken.chainId}
                            </span>
                            <ChevronDown size={14} />
                        </button>

                    </div>
                </div>

                {/* ── Arrow ──────────────────────────────────────────────── */}
                <div className="route-arrow">
                    <button className="route-arrow-inner" onClick={handleSwapTokens} aria-label="Swap direction">
                        <ArrowDown size={16} />
                    </button>
                </div>

                {/* ── To Output ──────────────────────────────────────────── */}
                <div className="input-group" style={{ marginBottom: 0 }}>
                    <div className="input-header">
                        <span>You receive</span>
                        <span>{toUSD}</span>
                    </div>
                    <div className="input-row">
                        <input
                            id="swap-output-display"
                            type="text"
                            className="token-input"
                            placeholder="0"
                            value={outputAmount}
                            disabled
                        />
                        <button id="to-token-selector" className="token-selector" onClick={() => setModalTarget('to')}>
                            <img
                                src={toToken.logoURI}
                                alt={toToken.symbol}
                                width={22} height={22}
                                style={{ borderRadius: '50%' }}
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <span>{toToken.symbol}</span>
                            <span style={{ fontSize: '0.65rem', padding: '1px 5px', background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', borderRadius: 8, fontWeight: 500 }}>
                                {CHAIN_NAMES[toToken.chainId] ?? toToken.chainId}
                            </span>
                            <ChevronDown size={14} />
                        </button>

                    </div>
                </div>

                {/* ── Quote Details ───────────────────────────────────────── */}
                {quote && (
                    <div className="quote-panel">
                        <div className="quote-row">
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <ShieldCheck size={13} color="var(--success)" /> Route Security
                            </span>
                            <strong style={{ color: 'var(--success)' }}>MEV Shield Active</strong>
                        </div>
                        <div className="quote-row">
                            <span>Price Impact</span>
                            <strong style={{ color: impactHigh ? 'var(--danger)' : impactMedium ? 'var(--warning)' : 'var(--success)' }}>
                                {(impactBps / 100).toFixed(2)}%
                            </strong>
                        </div>
                        <div className="quote-row">
                            <span>Gas Estimate</span>
                            <strong>
                                {quote.totalGasEstimated
                                    ? `${(Number(quote.totalGasEstimated) / 1e9).toFixed(2)} Gwei`
                                    : '—'}
                            </strong>
                        </div>
                        <div className="quote-row">
                            <span>Slippage</span>
                            <strong>{(slippage / 100).toFixed(2)}%</strong>
                        </div>
                    </div>
                )}

                {/* ── Fix M5: Price Impact Warning ───────────────────────── */}
                {impactMedium && (
                    <div className={`impact-warning ${impactHigh ? 'high' : 'medium'}`}>
                        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                        <div>
                            <div style={{ fontWeight: 700, marginBottom: 3 }}>
                                {impactHigh ? 'High Price Impact' : 'Price Impact Warning'}
                            </div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>
                                {impactHigh
                                    ? `${(impactBps / 100).toFixed(1)}% impact — you may receive significantly less than expected.`
                                    : `${(impactBps / 100).toFixed(1)}% impact. Consider reducing trade size.`
                                }
                            </div>
                            {impactHigh && !highImpactAck && (
                                <button
                                    onClick={() => setHighImpactAck(true)}
                                    style={{ marginTop: 8, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 6, padding: '5px 12px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    I understand, continue anyway
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Route Visualizer ────────────────────────────────────── */}
                {quote?.hops && <RouteVisualizer hops={quote.hops} />}

                {/* ── Error Banner ────────────────────────────────────────── */}
                {step === 'error' && error && (
                    <div className="banner error">
                        <div className="banner-title">
                            <AlertCircle size={15} /> Error
                        </div>
                        {error}
                    </div>
                )}

                {/* ── Success Banner ──────────────────────────────────────── */}
                {step === 'done' && (
                    <div className="banner success">
                        <div className="banner-title">
                            <CheckCircle2 size={15} /> Intent Submitted
                        </div>
                        {txHash && (
                            <a href={`https://atlantic.pharosscan.xyz/tx/${txHash}`} target="_blank" rel="noreferrer"
                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', marginTop: 4, color: 'var(--accent)' }}>
                                View on PharosScan <ExternalLink size={11} />
                            </a>
                        )}
                    </div>
                )}

                {/* ── Fix M2: Status Tracker after execution ──────────────── */}
                {step === 'done' && trackingHash && (
                    <StatusTracker trackingHash={trackingHash} txHash={txHash} />
                )}

                {/* ── Action Button ────────────────────────────────────────── */}
                <div style={{ marginTop: 16 }}>
                    {!isConnected ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '0.9rem', padding: '14px 0' }}>
                            Connect your wallet to get a quote
                        </div>
                    ) : step === 'done' ? (
                        <button className="btn-premium" onClick={() => { reset(); setAmount(''); }}>
                            ↺ New Swap
                        </button>
                    ) : (
                        <button
                            id="swap-action-btn"
                            className="btn-premium"
                            disabled={isLoading || !amount || parseFloat(amount) <= 0 || !canExecute && step === 'quoted'}
                            onClick={step === 'quoted' ? handleExecute : handleGetQuote}
                        >
                            {isLoading ? (
                                <>
                                    <RefreshCw size={16} className="spinning" />
                                    {step === 'quoting'  ? 'Finding best route…'
                                     : step === 'signing' ? 'Sign in wallet…'
                                     : 'Submitting intent…'}
                                </>
                            ) : step === 'quoted' && canExecute ? (
                                <><Rocket size={16} /> Execute Swap</>
                            ) : step === 'quoted' && !canExecute ? (
                                'Acknowledge impact above'
                            ) : (
                                'Get Quote'
                            )}
                        </button>
                    )}
                </div>

            </div>
        </>
    );
}
