'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from './ThemeProvider';
import styles from './JsonFormatter.module.css';

function formatJson(input: string, minify: boolean): { output: string; error: string } {
    if (!input.trim()) return { output: '', error: '' };
    try {
        const parsed = JSON.parse(input);
        const output = minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2);
        return { output, error: '' };
    } catch (e) {
        return { output: '', error: e instanceof SyntaxError ? e.message : 'Invalid JSON' };
    }
}

export default function JsonFormatter() {
    const { theme, toggleTheme } = useTheme();
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [error, setError] = useState('');
    const [minify, setMinify] = useState(false);
    const [copied, setCopied] = useState(false);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const inputGutterRef = useRef<HTMLDivElement>(null);
    const outputRef = useRef<HTMLDivElement>(null);
    const outputGutterRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            const result = formatJson(input, minify);
            setOutput(result.output);
            setError(result.error);
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [input, minify]);

    const syncInputScroll = useCallback(() => {
        if (inputGutterRef.current && inputRef.current) {
            inputGutterRef.current.scrollTop = inputRef.current.scrollTop;
        }
    }, []);

    const syncOutputScroll = useCallback(() => {
        if (outputGutterRef.current && outputRef.current) {
            outputGutterRef.current.scrollTop = outputRef.current.scrollTop;
        }
    }, []);

    async function handleCopy() {
        if (!output) return;
        await navigator.clipboard.writeText(output);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    function handleClear() {
        setInput('');
        setOutput('');
        setError('');
        inputRef.current?.focus();
    }

    const inputLineCount = input === '' ? 1 : input.split('\n').length;
    const outputLineCount = output ? output.split('\n').length : 0;

    const inputBytes = new TextEncoder().encode(input).length;
    const inputSize = inputBytes < 1024
        ? `${inputBytes} B`
        : `${(inputBytes / 1024).toFixed(1)} KB`;

    const isEmpty = input.trim() === '';
    const isValid = !error && !isEmpty;

    return (
        <div className={styles.wrapper}>
            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>JSON Formatter</span>
                <div className={styles.toolbarActions}>
                    <button
                        id="json-minify"
                        className={`${styles.actionBtn} ${minify ? styles.actionBtnActive : ''}`}
                        onClick={() => setMinify((m) => !m)}
                        disabled={!output}
                    >
                        {minify ? '↔ Pretty' : '↔ Minify'}
                    </button>
                    <button
                        id="json-copy"
                        className={styles.actionBtn}
                        onClick={handleCopy}
                        disabled={!output}
                    >
                        {copied ? '✓ Copied' : '⧉ Copy Output'}
                    </button>
                    <button
                        id="json-clear"
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        onClick={handleClear}
                        disabled={!input}
                    >
                        ✕ Clear
                    </button>
                    <button
                        id="json-theme-toggle"
                        className={styles.themeToggle}
                        onClick={toggleTheme}
                        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                    >
                        {theme === 'dark' ? '○' : '●'}
                        <span className={styles.themeLabel}>{theme === 'dark' ? 'Light' : 'Dark'}</span>
                    </button>
                </div>
            </div>

            <div className={styles.editors}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>Input</div>
                    <div className={styles.editorArea}>
                        <div ref={inputGutterRef} className={styles.gutter}>
                            {Array.from({ length: inputLineCount }, (_, i) => (
                                <div key={i} className={styles.lineNumber}>{i + 1}</div>
                            ))}
                        </div>
                        <textarea
                            ref={inputRef}
                            id="json-input"
                            className={styles.textarea}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onScroll={syncInputScroll}
                            spellCheck={false}
                            autoCorrect="off"
                            autoCapitalize="off"
                            autoComplete="off"
                            data-gramm="false"
                            placeholder="Paste or type JSON here..."
                        />
                    </div>
                </div>

                <div className={styles.divider} />

                <div className={styles.panel}>
                    <div className={styles.panelHeader}>Output</div>
                    <div className={styles.editorArea}>
                        {!error && outputLineCount > 0 && (
                            <div ref={outputGutterRef} className={styles.gutter}>
                                {Array.from({ length: outputLineCount }, (_, i) => (
                                    <div key={i} className={styles.lineNumber}>{i + 1}</div>
                                ))}
                            </div>
                        )}
                        <div
                            ref={outputRef}
                            id="json-output"
                            className={styles.outputArea}
                            onScroll={syncOutputScroll}
                        >
                            {error ? (
                                <pre className={styles.errorText}>{error}</pre>
                            ) : output ? (
                                <pre className={styles.outputText}>{output}</pre>
                            ) : (
                                <span className={styles.placeholder}>
                                    Formatted output will appear here...
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.statusBar}>
                <span className={`${styles.statusItem} ${isEmpty ? '' : isValid ? styles.statusValid : styles.statusInvalid}`}>
                    {isEmpty ? '—' : isValid ? '✓ Valid JSON' : '✕ Invalid JSON'}
                </span>
                <span className={styles.statusDivider}>|</span>
                <span className={styles.statusItem}>
                    {outputLineCount > 0 ? `${outputLineCount} lines` : '—'}
                </span>
                <span className={styles.statusDivider}>|</span>
                <span className={styles.statusItem}>{inputSize}</span>
            </div>
        </div>
    );
}
