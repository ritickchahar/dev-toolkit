'use client';

import { useState, useEffect } from 'react';
import styles from './JsonFormatter.module.css';

function HighlightText({ text, query }: { text: string; query: string }) {
    if (!query) return <>{text}</>;
    const lower = text.toLowerCase();
    const lowerQ = query.toLowerCase();
    const idx = lower.indexOf(lowerQ);
    if (idx === -1) return <>{text}</>;
    return (
        <>
            {text.slice(0, idx)}
            <mark className={styles.searchMark}>{text.slice(idx, idx + query.length)}</mark>
            {text.slice(idx + query.length)}
        </>
    );
}

function CopyBtn({ value, title }: { value: string; title?: string }) {
    const [copied, setCopied] = useState(false);
    function handle(e: React.MouseEvent) {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    }
    return (
        <button className={styles.inlineCopyBtn} onClick={handle} title={title}>
            {copied ? '✓' : '⧉'}
        </button>
    );
}

interface NodeProps {
    data: unknown;
    keyName?: string | number;
    path: string;
    isLast: boolean;
    searchQuery: string;
    sortKeys: boolean;
    defaultOpen: boolean;
    resetKey: number;
    onPathHover: (path: string | null) => void;
}

function TreeNode({ data, keyName, path, isLast, searchQuery, sortKeys, defaultOpen, resetKey, onPathHover }: NodeProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    useEffect(() => {
        setIsOpen(defaultOpen);
    }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const isArray = Array.isArray(data);
    const isObject = !isArray && typeof data === 'object' && data !== null;
    const isExpandable = isArray || isObject;
    const comma = isLast ? '' : ',';

    const keyEl = keyName !== undefined ? (
        <span className={styles.nodeKey}>
            {typeof keyName === 'string'
                ? <><span className={styles.jsonQuote}>&quot;</span><HighlightText text={keyName} query={searchQuery} /><span className={styles.jsonQuote}>&quot;</span></>
                : <HighlightText text={String(keyName)} query={searchQuery} />
            }
            <span className={styles.jsonColon}>: </span>
        </span>
    ) : null;

    if (!isExpandable) {
        let valClass: string;
        let display: string;

        if (data === null) {
            valClass = styles.jsonNull;
            display = 'null';
        } else if (typeof data === 'string') {
            valClass = styles.jsonString;
            display = data;
        } else if (typeof data === 'number') {
            valClass = styles.jsonNumber;
            display = String(data);
        } else if (typeof data === 'boolean') {
            valClass = styles.jsonBoolean;
            display = String(data);
        } else {
            valClass = '';
            display = String(data);
        }

        const isMatch = searchQuery
            ? (typeof data === 'string' ? data : display).toLowerCase().includes(searchQuery.toLowerCase())
            : false;
        const keyMatch = searchQuery && keyName !== undefined
            ? String(keyName).toLowerCase().includes(searchQuery.toLowerCase())
            : false;

        return (
            <div
                className={`${styles.treeRow} ${isMatch || keyMatch ? styles.searchMatchRow : ''}`}
                onMouseEnter={() => onPathHover(path)}
                onMouseLeave={() => onPathHover(null)}
            >
                <span className={styles.togglePlaceholder} />
                {keyEl}
                {typeof data === 'string' ? (
                    <span className={valClass}>
                        <span className={styles.jsonQuote}>&quot;</span>
                        <HighlightText text={display} query={searchQuery} />
                        <span className={styles.jsonQuote}>&quot;</span>
                    </span>
                ) : (
                    <span className={valClass}>
                        <HighlightText text={display} query={searchQuery} />
                    </span>
                )}
                <span className={styles.jsonPunct}>{comma}</span>
                <CopyBtn value={typeof data === 'string' ? data : display} title="Copy value" />
            </div>
        );
    }

    const entries: [string | number, unknown][] = isArray
        ? (data as unknown[]).map((v, i) => [i, v])
        : (sortKeys
            ? Object.entries(data as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
            : Object.entries(data as Record<string, unknown>)
        );

    const count = entries.length;
    const openBracket = isArray ? '[' : '{';
    const closeBracket = isArray ? ']' : '}';
    const keyMatch = searchQuery && keyName !== undefined
        ? String(keyName).toLowerCase().includes(searchQuery.toLowerCase())
        : false;

    return (
        <div className={styles.treeBlock}>
            <div
                className={`${styles.treeRow} ${styles.expandableRow} ${keyMatch ? styles.searchMatchRow : ''}`}
                onClick={() => setIsOpen(o => !o)}
                onMouseEnter={() => onPathHover(path)}
                onMouseLeave={() => onPathHover(null)}
            >
                <span className={`${styles.toggleArrow} ${isOpen ? styles.arrowOpen : ''}`}>▶</span>
                {keyEl}
                <span className={styles.jsonPunct}>{openBracket}</span>
                {!isOpen && count > 0 && (
                    <span className={styles.collapsedSummary}>
                        {isArray ? `${count} items` : `${count} keys`}
                    </span>
                )}
                {!isOpen && <span className={styles.jsonPunct}>{closeBracket}</span>}
                {!isOpen && <span className={styles.jsonPunct}>{comma}</span>}
                {isOpen && count > 0 && <CopyBtn value={JSON.stringify(data, null, 2)} title="Copy subtree" />}
            </div>
            {isOpen && count > 0 && (
                <div className={styles.treeChildren}>
                    {entries.map(([k, v], i) => (
                        <TreeNode
                            key={String(k)}
                            data={v}
                            keyName={k}
                            path={isArray ? `${path}[${k}]` : `${path}.${k}`}
                            isLast={i === count - 1}
                            searchQuery={searchQuery}
                            sortKeys={sortKeys}
                            defaultOpen={defaultOpen}
                            resetKey={resetKey}
                            onPathHover={onPathHover}
                        />
                    ))}
                </div>
            )}
            {isOpen && (
                <div className={styles.treeRow}>
                    <span className={styles.togglePlaceholder} />
                    <span className={styles.jsonPunct}>{closeBracket}</span>
                    <span className={styles.jsonPunct}>{comma}</span>
                </div>
            )}
        </div>
    );
}

export interface JsonTreeViewProps {
    data: unknown;
    searchQuery: string;
    sortKeys: boolean;
    defaultOpen: boolean;
    resetKey: number;
    onPathHover: (path: string | null) => void;
}

export default function JsonTreeView({ data, searchQuery, sortKeys, defaultOpen, resetKey, onPathHover }: JsonTreeViewProps) {
    return (
        <div className={styles.treeRoot}>
            <TreeNode
                data={data}
                path="$"
                isLast={true}
                searchQuery={searchQuery}
                sortKeys={sortKeys}
                defaultOpen={defaultOpen}
                resetKey={resetKey}
                onPathHover={onPathHover}
            />
        </div>
    );
}
