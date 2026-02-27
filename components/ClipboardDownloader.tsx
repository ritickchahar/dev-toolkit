'use client';

import { useState, useEffect, useCallback } from 'react';
import Titlebar from './Titlebar';
import styles from './ClipboardDownloader.module.css';

const MIME_TO_EXT: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
};

type Preview =
    | { type: 'image'; src: string; filename: string; size: number; w: number; h: number }
    | { type: 'text'; content: string; size: number };

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fmtSize(bytes: number) {
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export default function ClipboardDownloader() {
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [notice, setNotice] = useState('');
    const [preview, setPreview] = useState<Preview | null>(null);

    // Cleanup preview object URLs on change
    useEffect(() => {
        return () => {
            if (preview?.type === 'image') URL.revokeObjectURL(preview.src);
        };
    }, [preview]);

    function showError(msg: string) {
        setStatus('error');
        setMessage(msg);
        setPreview(null);
        setNotice('');
    }

    function processImage(blob: Blob, mimeType: string) {
        const ext = MIME_TO_EXT[mimeType] ?? mimeType.split('/')[1];
        const filename = `clipboard-image.${ext}`;
        triggerDownload(blob, filename);

        const src = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            setPreview({ type: 'image', src, filename, size: blob.size, w: img.naturalWidth, h: img.naturalHeight });
        };
        img.src = src;

        setStatus('success');
        setMessage(`Image downloaded as ${filename}`);
        setNotice('');
    }

    function processText(text: string, noImageSupport = false) {
        if (!text) { showError('Clipboard is empty.'); return; }
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        triggerDownload(blob, 'clipboard.txt');
        setPreview({ type: 'text', content: text, size: blob.size });
        setStatus('success');
        setMessage('Text downloaded as clipboard.txt');
        setNotice(noImageSupport ? 'Image clipboard reading is not supported in this browser. Text only.' : '');
    }

    // Paste event — uses DataTransferItemList (widely supported)
    const handlePaste = useCallback((e: ClipboardEvent) => {
        e.preventDefault();
        const dt = e.clipboardData;
        if (!dt) { showError('Clipboard is empty.'); return; }

        for (const item of Array.from(dt.items)) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) { processImage(file, item.type); return; }
            }
        }

        const text = dt.getData('text/plain');
        if (!text) { showError('Clipboard is empty.'); return; }
        processText(text);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [handlePaste]);

    // Button click — uses navigator.clipboard.read() with permission
    async function handleButton() {
        try {
            if (typeof navigator.clipboard?.read === 'function') {
                const items = await navigator.clipboard.read();
                let found = false;
                for (const item of items) {
                    for (const type of item.types) {
                        if (type.startsWith('image/')) {
                            found = true;
                            const blob = await item.getType(type);
                            processImage(blob, type);
                            break;
                        }
                    }
                    if (found) break;
                }
                if (!found) {
                    const text = await navigator.clipboard.readText();
                    processText(text);
                }
            } else {
                const text = await navigator.clipboard.readText();
                processText(text, true);
            }
        } catch (err) {
            if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
                showError('Clipboard access was denied. Please allow clipboard permissions and try again.');
            } else {
                showError('Unsupported clipboard content.');
            }
        }
    }

    const textPreview = preview?.type === 'text' ? preview : null;
    const imgPreview = preview?.type === 'image' ? preview : null;

    return (
        <div className={styles.wrapper}>
            <Titlebar title="Download" />
            <div className={styles.content}>
                <div className={styles.inner}>
                    {/* Drop zone */}
                    <div className={styles.zone}>
                        <span className={styles.zoneIcon}>⬇</span>
                        <p className={styles.zoneText}>Press Ctrl+V to download your clipboard</p>
                        <p className={styles.zoneHint}>Supports images (PNG, JPG, GIF, WebP) and text</p>
                        <button id="clipboard-download-btn" className={styles.downloadBtn} onClick={handleButton}>
                            Download Clipboard
                        </button>
                    </div>

                    {/* Errors */}
                    {status === 'error' && (
                        <p className={styles.errorMsg}>{message}</p>
                    )}

                    {/* Success + preview */}
                    {status === 'success' && (
                        <div className={styles.resultArea}>
                            <p className={styles.successMsg}>✓ {message}</p>
                            {notice && <p className={styles.noticeMsg}>{notice}</p>}

                            {imgPreview && (
                                <div className={styles.previewBox}>
                                    <img src={imgPreview.src} alt="clipboard preview" className={styles.previewImg} />
                                    <p className={styles.previewMeta}>
                                        {imgPreview.w} × {imgPreview.h} px · {fmtSize(imgPreview.size)} · .{imgPreview.filename.split('.').pop()}
                                    </p>
                                </div>
                            )}

                            {textPreview && (
                                <div className={styles.previewBox}>
                                    <textarea
                                        readOnly
                                        className={styles.previewTextarea}
                                        value={textPreview.content}
                                    />
                                    <p className={styles.previewMeta}>
                                        {textPreview.content.length.toLocaleString()} chars ·{' '}
                                        {textPreview.content.split('\n').length} lines ·{' '}
                                        {fmtSize(textPreview.size)}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
