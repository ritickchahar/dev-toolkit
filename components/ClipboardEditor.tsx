'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './ClipboardEditor.module.css';
import {
    loadClipboardAction, upsertTabAction, saveTabContentAction,
    deleteTabAction, setActiveTabAction,
} from '@/app/actions/clipboard';
import type { ClipTab } from '@/lib/dal/clipboard';

function makeTab(ord: number): ClipTab {
    return {
        id: `t${ord}`,
        title: ord === 1 ? 'Untitled' : `Untitled ${ord}`,
        ord,
        createdAt: new Date().toISOString(),
        content: '',
    };
}

export default function ClipboardEditor() {
    const [tabs, setTabs] = useState<ClipTab[]>([]);
    const [activeId, setActiveId] = useState('');
    const [counter, setCounter] = useState(1);
    const [contents, setContents] = useState<Record<string, string>>({});
    const [copied, setCopied] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [loaded, setLoaded] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const gutterRef = useRef<HTMLDivElement>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        loadClipboardAction().then(({ tabs: dbTabs, activeId: dbActiveId }) => {
            if (dbTabs.length > 0) {
                const loaded: Record<string, string> = {};
                for (const tab of dbTabs) loaded[tab.id] = tab.content;
                const maxOrd = dbTabs.reduce((m, t) => Math.max(m, t.ord), 0);
                setTabs(dbTabs);
                setActiveId(dbActiveId || dbTabs[0].id);
                setCounter(maxOrd);
                setContents(loaded);
            } else {
                const first = makeTab(1);
                setTabs([first]);
                setActiveId(first.id);
                setCounter(1);
                setContents({ [first.id]: '' });
                upsertTabAction(first);
            }
            setLoaded(true);
        });
    }, []);

    const activeContent = contents[activeId] ?? '';
    const lines = activeContent === '' ? 1 : activeContent.split('\n').length;
    const chars = activeContent.length;

    function handleContentChange(value: string) {
        setContents(prev => ({ ...prev, [activeId]: value }));
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            saveTabContentAction(activeId, value);
        }, 300);
    }

    function handleAddTab() {
        const next = counter + 1;
        const tab = makeTab(next);
        setTabs(prev => [...prev, tab]);
        setContents(prev => ({ ...prev, [tab.id]: '' }));
        setActiveId(tab.id);
        setCounter(next);
        upsertTabAction(tab);
        setActiveTabAction(tab.id);
        setTimeout(() => textareaRef.current?.focus(), 0);
    }

    function handleCloseTab(id: string, e: React.MouseEvent) {
        e.stopPropagation();
        if (tabs.length === 1) return;
        const idx = tabs.findIndex(t => t.id === id);
        const remaining = tabs.filter(t => t.id !== id);
        deleteTabAction(id);
        setContents(prev => { const next = { ...prev }; delete next[id]; return next; });
        setTabs(remaining);
        if (activeId === id) {
            const nextTab = remaining[Math.min(idx, remaining.length - 1)];
            setActiveId(nextTab.id);
            setActiveTabAction(nextTab.id);
        }
    }

    function handleTabClick(id: string) {
        setActiveId(id);
        setActiveTabAction(id);
        setTimeout(() => textareaRef.current?.focus(), 0);
    }

    function handleTabDoubleClick(id: string, name: string) {
        setEditingId(id);
        setEditingName(name);
        setTimeout(() => renameInputRef.current?.select(), 0);
    }

    function commitRename() {
        if (!editingId) return;
        const finalName = editingName.trim() || 'Untitled';
        setTabs(prev => prev.map(t => {
            if (t.id !== editingId) return t;
            const updated = { ...t, title: finalName };
            upsertTabAction(updated);
            return updated;
        }));
        setEditingId(null);
    }

    function handleRenameKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') commitRename();
        if (e.key === 'Escape') setEditingId(null);
    }

    const handleCopy = useCallback(async () => {
        if (!activeContent) return;
        await navigator.clipboard.writeText(activeContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [activeContent]);

    const handleClear = useCallback(() => {
        handleContentChange('');
        textareaRef.current?.focus();
    }, [activeId]);

    const syncScroll = useCallback(() => {
        if (gutterRef.current && textareaRef.current) {
            gutterRef.current.scrollTop = textareaRef.current.scrollTop;
        }
    }, []);

    if (!loaded || tabs.length === 0) return null;

    return (
        <div className={styles.wrapper}>
            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>clipboard</span>
                <div className={styles.toolbarActions}>
                    <button
                        className={styles.actionBtn}
                        onClick={handleCopy}
                        disabled={!activeContent}
                    >
                        {copied ? '✓ Copied' : '⧉ Copy All'}
                    </button>
                    <button
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        onClick={handleClear}
                        disabled={!activeContent}
                    >
                        ✕ Clear
                    </button>
                </div>
            </div>

            <div className={styles.tabBar}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`${styles.tab} ${tab.id === activeId ? styles.tabActive : ''}`}
                        onClick={() => handleTabClick(tab.id)}
                        onDoubleClick={() => handleTabDoubleClick(tab.id, tab.title)}
                    >
                        {editingId === tab.id ? (
                            <input
                                ref={renameInputRef}
                                className={styles.tabRenameInput}
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={handleRenameKeyDown}
                                onClick={e => e.stopPropagation()}
                            />
                        ) : (
                            <span className={styles.tabName}>{tab.title}</span>
                        )}
                        {tabs.length > 1 && (
                            <span
                                className={styles.tabClose}
                                onClick={e => handleCloseTab(tab.id, e)}
                            >
                                ✕
                            </span>
                        )}
                    </button>
                ))}
                <button className={styles.tabAdd} onClick={handleAddTab}>+</button>
            </div>

            <div className={styles.editorContainer}>
                <div ref={gutterRef} className={styles.gutter}>
                    {Array.from({ length: lines }, (_, i) => (
                        <div key={i} className={styles.lineNumber}>{i + 1}</div>
                    ))}
                </div>
                <textarea
                    ref={textareaRef}
                    className={styles.textarea}
                    value={activeContent}
                    onChange={e => handleContentChange(e.target.value)}
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
                <span className={styles.statusItem}>Ln {lines}</span>
                <span className={styles.statusDivider}>|</span>
                <span className={styles.statusItem}>{chars.toLocaleString()} chars</span>
                <span className={styles.statusDivider}>|</span>
                <span className={styles.statusItem}>{lines.toLocaleString()} lines</span>
            </div>
        </div>
    );
}
