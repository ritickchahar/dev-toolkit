'use client';

import { useState, useRef, useEffect } from 'react';
import ThemeSelector from './ThemeSelector';
import JsonTreeView from './JsonTreeView';
import styles from './JsonFormatter.module.css';

type ViewMode = 'tree' | 'text';
type IndentSize = 2 | 4 | 'tab';

function getIndentStr(size: IndentSize): string | number {
    return size === 'tab' ? '\t' : size;
}

function tryParse(raw: string): { parsed: unknown; error: string; decodeInfo: string | null } {
    const trimmed = raw.trim();
    if (!trimmed) return { parsed: null, error: '', decodeInfo: null };

    try {
        return { parsed: JSON.parse(trimmed), error: '', decodeInfo: null };
    } catch {}

    try {
        const decoded = decodeURIComponent(trimmed);
        const parsed = JSON.parse(decoded);
        return { parsed, error: '', decodeInfo: 'URL-decoded' };
    } catch {}

    try {
        const decoded = atob(trimmed);
        const parsed = JSON.parse(decoded);
        return { parsed, error: '', decodeInfo: 'Base64-decoded' };
    } catch {}

    try {
        JSON.parse(trimmed);
        return { parsed: null, error: '', decodeInfo: null };
    } catch (e) {
        return { parsed: null, error: e instanceof SyntaxError ? e.message : 'Invalid JSON', decodeInfo: null };
    }
}

function computeStats(data: unknown) {
    let keys = 0, strings = 0, numbers = 0, booleans = 0, nulls = 0, arrays = 0, objects = 0, maxDepth = 0;
    function walk(val: unknown, depth: number) {
        if (depth > maxDepth) maxDepth = depth;
        if (val === null) { nulls++; return; }
        if (typeof val === 'string') { strings++; return; }
        if (typeof val === 'number') { numbers++; return; }
        if (typeof val === 'boolean') { booleans++; return; }
        if (Array.isArray(val)) {
            arrays++;
            val.forEach(v => walk(v, depth + 1));
            return;
        }
        if (typeof val === 'object') {
            objects++;
            const entries = Object.entries(val as Record<string, unknown>);
            keys += entries.length;
            entries.forEach(([, v]) => walk(v, depth + 1));
        }
    }
    walk(data, 0);
    return { keys, strings, numbers, booleans, nulls, arrays, objects, maxDepth };
}

function syncGutter(textarea: HTMLTextAreaElement | null, gutter: HTMLDivElement | null) {
    if (textarea && gutter) gutter.scrollTop = textarea.scrollTop;
}

export default function JsonFormatter() {
    const [input, setInput] = useState(() =>
        typeof window !== 'undefined' ? (localStorage.getItem('json-formatter-input') ?? '') : ''
    );
    const [viewMode, setViewMode] = useState<ViewMode>('tree');
    const [minify, setMinify] = useState(false);
    const [sortKeys, setSortKeys] = useState(false);
    const [indentSize, setIndentSize] = useState<IndentSize>(2);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredPath, setHoveredPath] = useState<string | null>(null);
    const [defaultOpen, setDefaultOpen] = useState(true);
    const [treeResetKey, setTreeResetKey] = useState(0);
    const [copied, setCopied] = useState(false);

    const [parseResult, setParseResult] = useState<{ parsed: unknown; error: string; decodeInfo: string | null }>({ parsed: null, error: '', decodeInfo: null });

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const inputGutterRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { localStorage.setItem('json-formatter-input', input); }, [input]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setParseResult(tryParse(input));
        }, 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [input]);

    useEffect(() => {
        if (showSearch) searchRef.current?.focus();
    }, [showSearch]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                setShowSearch(s => !s);
            }
            if (e.key === 'Escape' && showSearch) {
                setShowSearch(false);
                setSearchQuery('');
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showSearch]);

    const { parsed, error, decodeInfo } = parseResult;

    const textOutput = parsed !== null
        ? (minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, getIndentStr(indentSize)))
        : '';

    const stats = parsed !== null ? computeStats(parsed) : null;

    function handleExpandAll() {
        setDefaultOpen(true);
        setTreeResetKey(k => k + 1);
    }

    function handleCollapseAll() {
        setDefaultOpen(false);
        setTreeResetKey(k => k + 1);
    }

    async function handleCopy() {
        const text = viewMode === 'text' ? textOutput : JSON.stringify(parsed, null, 2);
        if (!text) return;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    function handleClear() {
        setInput('');
        setSearchQuery('');
        inputRef.current?.focus();
    }

    function handleDownload() {
        const text = viewMode === 'text' ? textOutput : JSON.stringify(parsed, null, 2);
        if (!text) return;
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'output.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setInput(ev.target?.result as string ?? '');
        reader.readAsText(file);
        e.target.value = '';
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => setInput(ev.target?.result as string ?? '');
            reader.readAsText(file);
        } else {
            const text = e.dataTransfer.getData('text/plain');
            if (text) setInput(text);
        }
    }

    const isEmpty = input.trim() === '';
    const isValid = !error && !isEmpty;
    const inputLineCount = input === '' ? 1 : input.split('\n').length;
    const inputBytes = new TextEncoder().encode(input).length;
    const inputSize = inputBytes < 1024 ? `${inputBytes} B` : `${(inputBytes / 1024).toFixed(1)} KB`;

    return (
        <div className={styles.wrapper}>
            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>JSON</span>
                <div className={styles.toolbarActions}>
                    <button
                        className={`${styles.actionBtn} ${viewMode === 'tree' ? styles.actionBtnActive : ''}`}
                        onClick={() => setViewMode('tree')}
                    >
                        Tree
                    </button>
                    <button
                        className={`${styles.actionBtn} ${viewMode === 'text' ? styles.actionBtnActive : ''}`}
                        onClick={() => setViewMode('text')}
                    >
                        Text
                    </button>
                    <div className={styles.toolbarSep} />
                    {viewMode === 'tree' && (
                        <>
                            <button className={styles.actionBtn} onClick={handleExpandAll} disabled={!parsed}>
                                ⊞ Expand
                            </button>
                            <button className={styles.actionBtn} onClick={handleCollapseAll} disabled={!parsed}>
                                ⊟ Collapse
                            </button>
                            <button
                                className={`${styles.actionBtn} ${sortKeys ? styles.actionBtnActive : ''}`}
                                onClick={() => setSortKeys(s => !s)}
                                disabled={!parsed}
                            >
                                A↑Z Sort
                            </button>
                            <div className={styles.toolbarSep} />
                        </>
                    )}
                    {viewMode === 'text' && (
                        <>
                            <button
                                className={`${styles.actionBtn} ${minify ? styles.actionBtnActive : ''}`}
                                onClick={() => setMinify(m => !m)}
                                disabled={!parsed}
                            >
                                ↔ Minify
                            </button>
                            <select
                                className={styles.actionSelect}
                                value={String(indentSize)}
                                onChange={e => {
                                    const v = e.target.value;
                                    setIndentSize(v === 'tab' ? 'tab' : Number(v) as IndentSize);
                                }}
                                disabled={!parsed || minify}
                            >
                                <option value="2">2 spaces</option>
                                <option value="4">4 spaces</option>
                                <option value="tab">Tab</option>
                            </select>
                            <div className={styles.toolbarSep} />
                        </>
                    )}
                    <button
                        className={`${styles.actionBtn} ${showSearch ? styles.actionBtnActive : ''}`}
                        onClick={() => { setShowSearch(s => !s); if (showSearch) setSearchQuery(''); }}
                        disabled={viewMode !== 'tree' || !parsed}
                        title="Ctrl+F"
                    >
                        ⌕ Search
                    </button>
                    <div className={styles.toolbarSep} />
                    <button className={styles.actionBtn} onClick={handleDownload} disabled={!parsed}>
                        ↓ Save
                    </button>
                    <button className={styles.actionBtn} onClick={handleCopy} disabled={!parsed}>
                        {copied ? '✓ Copied' : '⧉ Copy'}
                    </button>
                    <button
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        onClick={handleClear}
                        disabled={!input}
                    >
                        ✕ Clear
                    </button>
                    <ThemeSelector />
                </div>
            </div>

            {showSearch && viewMode === 'tree' && (
                <div className={styles.searchBar}>
                    <span className={styles.searchIcon}>⌕</span>
                    <input
                        ref={searchRef}
                        className={styles.searchInput}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search keys and values..."
                    />
                    {searchQuery && (
                        <button className={styles.searchClear} onClick={() => setSearchQuery('')}>✕</button>
                    )}
                    <button className={styles.searchClose} onClick={() => { setShowSearch(false); setSearchQuery(''); }}>
                        Esc
                    </button>
                </div>
            )}

            <div className={styles.editors}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <span>Input</span>
                        <div className={styles.panelHeaderActions}>
                            <button className={styles.panelBtn} onClick={() => fileInputRef.current?.click()}>
                                ↑ Open file
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json,application/json,text/plain"
                                style={{ display: 'none' }}
                                onChange={handleFileUpload}
                            />
                        </div>
                    </div>
                    <div
                        className={styles.editorArea}
                        onDrop={handleDrop}
                        onDragOver={e => e.preventDefault()}
                    >
                        <div ref={inputGutterRef} className={styles.gutter}>
                            {Array.from({ length: inputLineCount }, (_, i) => (
                                <div key={i} className={styles.lineNumber}>{i + 1}</div>
                            ))}
                        </div>
                        <textarea
                            ref={inputRef}
                            className={styles.textarea}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onScroll={() => syncGutter(inputRef.current, inputGutterRef.current)}
                            spellCheck={false}
                            autoCorrect="off"
                            autoCapitalize="off"
                            autoComplete="off"
                            data-gramm="false"
                            placeholder="Paste or type JSON here... (or drag & drop a file)"
                        />
                    </div>
                </div>

                <div className={styles.divider} />

                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <span>Output</span>
                        {hoveredPath && <span className={styles.pathDisplay}>{hoveredPath}</span>}
                    </div>
                    <div className={styles.outputArea}>
                        {error ? (
                            <pre className={styles.errorText}>{error}</pre>
                        ) : parsed !== null ? (
                            viewMode === 'tree' ? (
                                <JsonTreeView
                                    data={parsed}
                                    searchQuery={searchQuery}
                                    sortKeys={sortKeys}
                                    defaultOpen={defaultOpen}
                                    resetKey={treeResetKey}
                                    onPathHover={setHoveredPath}
                                />
                            ) : (
                                <pre className={styles.outputText}>{textOutput}</pre>
                            )
                        ) : (
                            <span className={styles.placeholder}>Formatted output will appear here...</span>
                        )}
                    </div>
                </div>
            </div>

            <div className={styles.statusBar}>
                <span className={`${styles.statusItem} ${isEmpty ? '' : isValid ? styles.statusValid : styles.statusInvalid}`}>
                    {isEmpty ? '—' : isValid ? '✓ Valid JSON' : '✕ Invalid JSON'}
                </span>
                {decodeInfo && (
                    <>
                        <span className={styles.statusDivider}>|</span>
                        <span className={`${styles.statusItem} ${styles.statusDecodeInfo}`}>{decodeInfo}</span>
                    </>
                )}
                {stats && (
                    <>
                        <span className={styles.statusDivider}>|</span>
                        <span className={styles.statusItem}>{stats.keys} keys</span>
                        <span className={styles.statusDivider}>|</span>
                        <span className={styles.statusItem}>{stats.arrays} arrays · {stats.objects} objects</span>
                        <span className={styles.statusDivider}>|</span>
                        <span className={styles.statusItem}>depth {stats.maxDepth}</span>
                    </>
                )}
                <span className={styles.statusDivider}>|</span>
                <span className={styles.statusItem}>{inputSize}</span>
            </div>
        </div>
    );
}
