'use client';

import { useState, useRef, useCallback } from 'react';
import styles from './ClipboardEditor.module.css';

export default function ClipboardEditor() {
    const [content, setContent] = useState('');
    const [copied, setCopied] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const lines = content === '' ? 1 : content.split('\n').length;
    const chars = content.length;

    const lineNumbers = Array.from({ length: lines }, (_, i) => i + 1);

    const handleCopy = useCallback(async () => {
        if (!content) return;
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [content]);

    const handleClear = useCallback(() => {
        setContent('');
        textareaRef.current?.focus();
    }, []);

    const syncScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
        const gutter = document.getElementById('line-gutter');
        if (gutter) {
            gutter.scrollTop = e.currentTarget.scrollTop;
        }
    }, []);

    return (
        <div className={styles.wrapper}>
            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>clipboard</span>
                <div className={styles.toolbarActions}>
                    <button
                        id="copy-button"
                        className={styles.actionBtn}
                        onClick={handleCopy}
                        disabled={!content}
                    >
                        {copied ? '✓ Copied' : '⧉ Copy All'}
                    </button>
                    <button
                        id="clear-button"
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        onClick={handleClear}
                        disabled={!content}
                    >
                        ✕ Clear
                    </button>
                </div>
            </div>

            <div className={styles.editorContainer}>
                <div id="line-gutter" className={styles.gutter}>
                    {lineNumbers.map((n) => (
                        <div key={n} className={styles.lineNumber}>
                            {n}
                        </div>
                    ))}
                </div>
                <textarea
                    ref={textareaRef}
                    id="clipboard-textarea"
                    className={styles.textarea}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onScroll={syncScroll}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    autoComplete="off"
                    data-gramm="false"
                    placeholder="Paste or type anything here..."
                />
            </div>

            <div className={styles.statusBar}>
                <span className={styles.statusItem}>
                    Ln {lines}
                </span>
                <span className={styles.statusDivider}>|</span>
                <span className={styles.statusItem}>
                    {chars.toLocaleString()} chars
                </span>
                <span className={styles.statusDivider}>|</span>
                <span className={styles.statusItem}>
                    {lines.toLocaleString()} lines
                </span>
            </div>
        </div>
    );
}
