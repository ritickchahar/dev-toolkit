'use client';

import { useState } from 'react';
import ThemeSelector from './ThemeSelector';
import styles from './JwtDecoder.module.css';

const CLAIM_LABELS: Record<string, string> = {
    iss: 'Issuer', sub: 'Subject', aud: 'Audience',
    exp: 'Expires', iat: 'Issued At', nbf: 'Not Before',
};
const TS_CLAIMS = new Set(['exp', 'iat', 'nbf']);

function decodeSegment(seg: string) {
    try {
        const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4 ? b64 + '='.repeat(4 - b64.length % 4) : b64;
        const obj = JSON.parse(atob(pad));
        return { json: JSON.stringify(obj, null, 2), obj: obj as Record<string, unknown>, err: '' };
    } catch {
        return { json: '', obj: null as null, err: 'Could not decode this segment' };
    }
}

function fmtTs(val: unknown) {
    if (typeof val !== 'number') return String(val);
    return new Date(val * 1000).toLocaleString();
}

export default function JwtDecoder() {
    const [token, setToken] = useState('');
    const [copied, setCopied] = useState<string | null>(null);

    function handleCopy(key: string, text: string) {
        navigator.clipboard.writeText(text).catch(() => { });
        setCopied(key);
        setTimeout(() => setCopied(null), 1500);
    }

    const raw = token.trim();
    const parts = raw.split('.');
    const valid = parts.length === 3 && parts.every(p => p.length > 0);
    const header = valid ? decodeSegment(parts[0]) : null;
    const payload = valid ? decodeSegment(parts[1]) : null;
    const sig = valid ? parts[2] : null;

    // Status
    let statusText = 'Paste a JWT token above.';
    let statusCls = styles.statusDim;
    if (raw) {
        if (!valid) {
            statusText = 'Invalid JWT Structure'; statusCls = styles.statusError;
        } else if (header?.err || payload?.err) {
            statusText = 'Invalid JWT'; statusCls = styles.statusError;
        } else {
            const exp = payload?.obj?.exp;
            if (typeof exp === 'number') {
                const d = new Date(exp * 1000);
                if (d < new Date()) {
                    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
                    statusText = `Token Expired · ${mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`} ago (${d.toLocaleString()})`;
                    statusCls = styles.statusError;
                } else {
                    statusText = `Valid Token · Expires ${d.toLocaleString()}`;
                    statusCls = styles.statusSuccess;
                }
            } else {
                statusText = 'Valid Token · No expiry claim';
                statusCls = styles.statusSuccess;
            }
        }
    }

    const claims = payload?.obj ? Object.entries(payload.obj).filter(([k]) => CLAIM_LABELS[k]) : [];

    return (
        <div className={styles.wrapper}>
            {/* Toolbar */}
            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>JWT Decoder</span>
                <div className={styles.toolbarActions}>
                    {raw && (
                        <>
                            <button className={styles.actionBtn} onClick={() => handleCopy('token', raw)}>
                                {copied === 'token' ? '✓ Copied' : '⧉ Copy Token'}
                            </button>
                            <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => setToken('')}>
                                ✕ Clear
                            </button>
                        </>
                    )}
                    <ThemeSelector />
                </div>
            </div>

            {/* Input */}
            <div className={styles.inputArea}>
                <textarea
                    id="jwt-input"
                    className={styles.tokenInput}
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    placeholder="Paste your JWT token here…  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                />
            </div>

            {/* Cards */}
            <div className={styles.cards}>
                {/* Header */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <span className={styles.cardLabel}>Header</span>
                        {header?.json && (
                            <button className={styles.cardCopyBtn} onClick={() => handleCopy('header', header.json)}>
                                {copied === 'header' ? '✓ Copied' : '⧉ Copy'}
                            </button>
                        )}
                    </div>
                    <div className={styles.cardBody}>
                        {!raw ? <span className={styles.cardEmpty}>—</span>
                            : header?.err ? <span className={styles.cardError}>{header.err}</span>
                                : <pre className={styles.codeBlock}>{header?.json}</pre>}
                    </div>
                </div>

                {/* Payload */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <span className={styles.cardLabel}>Payload</span>
                        {payload?.json && (
                            <button className={styles.cardCopyBtn} onClick={() => handleCopy('payload', payload.json)}>
                                {copied === 'payload' ? '✓ Copied' : '⧉ Copy'}
                            </button>
                        )}
                    </div>
                    <div className={styles.cardBody}>
                        {!raw ? <span className={styles.cardEmpty}>—</span>
                            : payload?.err ? <span className={styles.cardError}>{payload.err}</span>
                                : <>
                                    <pre className={styles.codeBlock}>{payload?.json}</pre>
                                    {claims.length > 0 && (
                                        <div className={styles.claims}>
                                            <p className={styles.claimsTitle}>Standard Claims</p>
                                            {claims.map(([k, v]) => (
                                                <div key={k} className={styles.claimRow}>
                                                    <span className={styles.claimKey}>{CLAIM_LABELS[k]}</span>
                                                    <span className={styles.claimVal}>
                                                        {TS_CLAIMS.has(k) ? fmtTs(v) : String(v)}
                                                        {TS_CLAIMS.has(k) && <span className={styles.claimRaw}> · raw: {String(v)}</span>}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>}
                    </div>
                </div>

                {/* Signature */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <span className={styles.cardLabel}>Signature</span>
                        {sig && (
                            <button className={styles.cardCopyBtn} onClick={() => handleCopy('sig', sig)}>
                                {copied === 'sig' ? '✓ Copied' : '⧉ Copy'}
                            </button>
                        )}
                    </div>
                    <div className={styles.cardBody}>
                        {!raw ? <span className={styles.cardEmpty}>—</span>
                            : !valid ? <span className={styles.cardError}>Invalid</span>
                                : <>
                                    <pre className={styles.codeBlock} style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{sig}</pre>
                                    <p className={styles.sigNote}>Signature cannot be verified without the secret key.</p>
                                </>}
                    </div>
                </div>
            </div>

            <div className={`${styles.statusBar} ${statusCls}`}>{statusText}</div>
        </div>
    );
}
