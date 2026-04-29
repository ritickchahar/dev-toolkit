'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ThemeSelector from './ThemeSelector';
import { getSettingAction, setSettingAction } from '@/app/actions/settings';
import styles from './CsvViewer.module.css';

// ── CSV parser (handles quoted fields, commas/newlines in quotes, escaped quotes) ──
function parseCsv(input: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;
    let i = 0;

    while (i < input.length) {
        const ch = input[i];
        if (inQuotes) {
            if (ch === '"') {
                if (input[i + 1] === '"') { cell += '"'; i += 2; continue; }
                inQuotes = false; i++; continue;
            }
            cell += ch; i++; continue;
        }
        if (ch === '"') { inQuotes = true; i++; continue; }
        if (ch === delimiter) { row.push(cell); cell = ''; i++; continue; }
        if (ch === '\r' && input[i + 1] === '\n') { row.push(cell); cell = ''; rows.push(row); row = []; i += 2; continue; }
        if (ch === '\n') { row.push(cell); cell = ''; rows.push(row); row = []; i++; continue; }
        cell += ch; i++;
    }
    if (cell || row.length > 0) { row.push(cell); rows.push(row); }
    // Remove trailing empty row
    if (rows.length && rows[rows.length - 1].every(c => c === '')) rows.pop();
    return rows;
}

// ── Auto detect delimiter ──
function detectDelimiter(firstLine: string): string {
    const candidates = [',', ';', '\t', '|'] as const;
    let best = ','; let bestCount = 0;
    for (const d of candidates) {
        const c = firstLine.split(d).length - 1;
        if (c > bestCount) { bestCount = c; best = d; }
    }
    return best;
}

function delimiterLabel(d: string) {
    if (d === ',') return 'Comma';
    if (d === ';') return 'Semicolon';
    if (d === '\t') return 'Tab';
    if (d === '|') return 'Pipe';
    return d;
}

const DELIM_OPTIONS = [
    { label: 'Auto Detect', value: 'auto' },
    { label: 'Comma', value: ',' },
    { label: 'Semicolon', value: ';' },
    { label: 'Tab', value: '\t' },
    { label: 'Pipe', value: '|' },
];

type SortDir = 'asc' | 'desc' | 'none';

function isNumeric(val: string) { return val !== '' && !isNaN(Number(val)); }

function sortRows(rows: string[][], col: number, dir: SortDir): string[][] {
    if (dir === 'none') return rows;
    const numeric = rows.every(r => isNumeric(r[col] ?? ''));
    const sorted = [...rows].sort((a, b) => {
        const av = a[col] ?? '', bv = b[col] ?? '';
        if (numeric) return Number(av) - Number(bv);
        return av.localeCompare(bv);
    });
    return dir === 'desc' ? sorted.reverse() : sorted;
}

function rowsToCsv(headers: string[], rows: string[][]): string {
    const escape = (c: string) => c.includes(',') || c.includes('"') || c.includes('\n') ? `"${c.replace(/"/g, '""')}"` : c;
    return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
}

function rowsToTsv(headers: string[], rows: string[][]): string {
    return [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
}

export default function CsvViewer() {
    const [input, setInput] = useState('');
    const [delimChoice, setDelimChoice] = useState('auto');
    const [search, setSearch] = useState('');
    const [sortCol, setSortCol] = useState(-1);
    const [sortDir, setSortDir] = useState<SortDir>('none');
    const [hovCol, setHovCol] = useState(-1);
    const [copiedCsv, setCopiedCsv] = useState(false);
    const [copiedTable, setCopiedTable] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const persistInputRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [parsed, setParsed] = useState<string[][]>([]);
    const [activeDelim, setActiveDelim] = useState(',');
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        Promise.all([
            getSettingAction('csv_input'),
            getSettingAction('csv_delim_choice'),
            getSettingAction('csv_sort_col'),
            getSettingAction('csv_sort_dir'),
        ]).then(([inp, dc, sc, sd]) => {
            if (inp) setInput(inp);
            if (dc) setDelimChoice(dc);
            if (sc) setSortCol(Number(sc));
            if (sd === 'asc' || sd === 'desc' || sd === 'none') setSortDir(sd);
            setLoaded(true);
        });
    }, []);

    useEffect(() => {
        if (!loaded) return;
        if (persistInputRef.current) clearTimeout(persistInputRef.current);
        persistInputRef.current = setTimeout(() => {
            setSettingAction('csv_input', input);
        }, 400);
        return () => { if (persistInputRef.current) clearTimeout(persistInputRef.current); };
    }, [input, loaded]);

    useEffect(() => {
        if (!loaded) return;
        setSettingAction('csv_delim_choice', delimChoice);
    }, [delimChoice, loaded]);

    useEffect(() => {
        if (!loaded) return;
        setSettingAction('csv_sort_col', String(sortCol));
        setSettingAction('csv_sort_dir', sortDir);
    }, [sortCol, sortDir, loaded]);

    // Parse with debounce
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            if (!input.trim()) { setParsed([]); return; }
            const firstLine = input.split(/\r?\n/)[0];
            const delim = delimChoice === 'auto' ? detectDelimiter(firstLine) : delimChoice;
            setActiveDelim(delim);
            setParsed(parseCsv(input, delim));
        }, 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [input, delimChoice]);

    // Reset sort when input changes (but not on initial hydration)
    const initialInputRef = useRef<string | null>(null);
    useEffect(() => {
        if (!loaded) return;
        if (initialInputRef.current === null) { initialInputRef.current = input; return; }
        if (input === initialInputRef.current) return;
        initialInputRef.current = input;
        setSortCol(-1); setSortDir('none');
    }, [input, loaded]);

    const headers = parsed[0] ?? [];
    const dataRows = parsed.slice(1);

    // Search filter
    const searchLower = search.toLowerCase();
    const filtered = search
        ? dataRows.filter(r => r.some(c => c.toLowerCase().includes(searchLower)))
        : dataRows;

    // Sort
    const displayed = sortCol >= 0 && sortDir !== 'none' ? sortRows(filtered, sortCol, sortDir) : filtered;

    // Inconsistent columns
    const expectedCols = headers.length;
    const badRows = dataRows.filter(r => r.length !== expectedCols).length;

    function handleSort(col: number) {
        if (sortCol !== col) { setSortCol(col); setSortDir('asc'); return; }
        if (sortDir === 'asc') { setSortDir('desc'); return; }
        if (sortDir === 'desc') { setSortDir('none'); setSortCol(-1); return; }
        setSortDir('asc');
    }

    function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { if (typeof reader.result === 'string') setInput(reader.result); };
        reader.readAsText(file);
        e.target.value = '';
    }

    function handleClear() { setInput(''); setSearch(''); setSortCol(-1); setSortDir('none'); }

    const handleCopyCsv = useCallback(() => {
        navigator.clipboard.writeText(input).catch(() => { });
        setCopiedCsv(true); setTimeout(() => setCopiedCsv(false), 1500);
    }, [input]);

    function handleDownload() {
        const csv = rowsToCsv(headers, displayed);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'export.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function handleCopyTable() {
        const tsv = rowsToTsv(headers, displayed);
        navigator.clipboard.writeText(tsv).catch(() => { });
        setCopiedTable(true); setTimeout(() => setCopiedTable(false), 1500);
    }

    const hasData = parsed.length > 0;
    const headersOnly = hasData && dataRows.length === 0;
    const isEmpty = !input.trim();

    return (
        <div className={styles.wrapper}>
            {/* Toolbar */}
            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>CSV Viewer</span>
                <div className={styles.toolbarActions}>
                    <ThemeSelector />
                </div>
            </div>

            {/* Input controls */}
            <div className={styles.inputControls}>
                <button className={styles.actionBtn} onClick={() => fileRef.current?.click()}>↑ Upload CSV</button>
                <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} style={{ display: 'none' }} />
                <select
                    className={styles.delimSelect}
                    value={delimChoice}
                    onChange={e => setDelimChoice(e.target.value)}
                >
                    {DELIM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button className={styles.actionBtn} onClick={handleCopyCsv} disabled={isEmpty}>
                    {copiedCsv ? '✓ Copied' : '⧉ Copy CSV'}
                </button>
                <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={handleClear} disabled={isEmpty}>
                    ✕ Clear
                </button>
            </div>

            {/* Textarea */}
            <div className={styles.inputArea}>
                <textarea
                    id="csv-input"
                    className={styles.textarea}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Paste CSV data here or upload a file…"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                />
            </div>

            {/* Table section */}
            <div className={styles.tableSection}>
                {/* Table controls */}
                {hasData && !headersOnly && (
                    <div className={styles.tableControls}>
                        <input
                            id="csv-search"
                            type="text"
                            className={styles.searchInput}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search rows…"
                        />
                        <div className={styles.tableControlsRight}>
                            <button className={styles.actionBtn} onClick={handleDownload}>⬇ Download CSV</button>
                            <button className={styles.actionBtn} onClick={handleCopyTable}>
                                {copiedTable ? '✓ Copied' : '⧉ Copy Table'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Table or placeholder */}
                <div className={styles.tableWrap}>
                    {isEmpty && (
                        <p className={styles.placeholder}>Paste CSV above or upload a file to preview it here.</p>
                    )}
                    {!isEmpty && headersOnly && (
                        <p className={styles.placeholder}>Only headers detected. Paste data rows below the first line.</p>
                    )}
                    {hasData && !headersOnly && (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.rowNumHeader}>#</th>
                                    {headers.map((h, ci) => (
                                        <th
                                            key={ci}
                                            className={`${styles.th} ${hovCol === ci ? styles.colHighlight : ''}`}
                                            onClick={() => handleSort(ci)}
                                            onMouseEnter={() => setHovCol(ci)}
                                            onMouseLeave={() => setHovCol(-1)}
                                        >
                                            <span>{h || `Col ${ci + 1}`}</span>
                                            {sortCol === ci && sortDir === 'asc' && <span className={styles.sortArrow}> ▲</span>}
                                            {sortCol === ci && sortDir === 'desc' && <span className={styles.sortArrow}> ▼</span>}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {displayed.map((row, ri) => (
                                    <tr key={ri} className={ri % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                                        <td className={styles.rowNum}>{ri + 1}</td>
                                        {headers.map((_, ci) => (
                                            <td
                                                key={ci}
                                                className={`${styles.td} ${hovCol === ci ? styles.colHighlight : ''}`}
                                                onMouseEnter={() => setHovCol(ci)}
                                                onMouseLeave={() => setHovCol(-1)}
                                            >
                                                {row[ci] ?? ''}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Status bar */}
            <div className={styles.statusBar}>
                {hasData ? (
                    <>
                        <span className={styles.statusItem}>
                            {search ? `Showing ${displayed.length} of ${dataRows.length} rows` : `${dataRows.length} rows`}
                        </span>
                        <span className={styles.statusDivider}>|</span>
                        <span className={styles.statusItem}>{headers.length} columns</span>
                        <span className={styles.statusDivider}>|</span>
                        <span className={styles.statusItem}>Delimiter: {delimiterLabel(activeDelim)}</span>
                        {badRows > 0 && (
                            <>
                                <span className={styles.statusDivider}>|</span>
                                <span className={styles.statusWarning}>⚠ {badRows} row{badRows > 1 ? 's' : ''} with inconsistent column count</span>
                            </>
                        )}
                    </>
                ) : (
                    <span className={styles.statusItem}>—</span>
                )}
            </div>
        </div>
    );
}
