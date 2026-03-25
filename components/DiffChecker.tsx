'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { diff_match_patch, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL, type Diff } from 'diff-match-patch';
import ThemeSelector from './ThemeSelector';
import styles from './DiffChecker.module.css';

interface LineInfo {
    text: string;
    type: 'removed' | 'added' | 'equal' | 'empty';
    chunkId: number | null;
}

function computeLineDiff(left: string, right: string): { leftLines: LineInfo[]; rightLines: LineInfo[] } {
    const dmp = new diff_match_patch();
    const diffs: Diff[] = dmp.diff_main(left, right);
    dmp.diff_cleanupSemantic(diffs);

    const leftLines: LineInfo[] = [];
    const rightLines: LineInfo[] = [];

    let chunkId = 0;
    let leftBuf = '';
    let rightBuf = '';

    function flushEqual(text: string) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (i < lines.length - 1) {
                leftBuf += lines[i];
                rightBuf += lines[i];
                leftLines.push({ text: leftBuf, type: 'equal', chunkId: null });
                rightLines.push({ text: rightBuf, type: 'equal', chunkId: null });
                leftBuf = '';
                rightBuf = '';
            } else {
                leftBuf += lines[i];
                rightBuf += lines[i];
            }
        }
    }

    function flushChanged() {
        const removedText = leftBuf;
        const addedText = rightBuf;
        leftBuf = '';
        rightBuf = '';

        if (!removedText && !addedText) return;

        const removedLines = removedText.split('\n');
        const addedLines = addedText.split('\n');

        const maxLen = Math.max(removedLines.length, addedLines.length);
        const id = chunkId++;

        for (let i = 0; i < maxLen; i++) {
            if (i < removedLines.length) {
                leftLines.push({ text: removedLines[i], type: 'removed', chunkId: id });
            } else {
                leftLines.push({ text: '', type: 'empty', chunkId: null });
            }
            if (i < addedLines.length) {
                rightLines.push({ text: addedLines[i], type: 'added', chunkId: id });
            } else {
                rightLines.push({ text: '', type: 'empty', chunkId: null });
            }
        }
    }

    let prevWasChange = false;

    for (const [op, text] of diffs) {
        if (op === DIFF_EQUAL) {
            if (prevWasChange) {
                flushChanged();
            }
            prevWasChange = false;
            flushEqual(text);
        } else {
            if (!prevWasChange && (leftBuf || rightBuf)) {
                flushChanged();
            }
            prevWasChange = true;
            if (op === DIFF_DELETE) {
                leftBuf += text;
            } else {
                rightBuf += text;
            }
        }
    }

    if (leftBuf || rightBuf) {
        flushChanged();
    }

    return { leftLines, rightLines };
}

export default function DiffChecker() {
    const [leftText, setLeftText] = useState(() =>
        typeof window !== 'undefined' ? (localStorage.getItem('diff-checker-left') ?? '') : ''
    );
    const [rightText, setRightText] = useState(() =>
        typeof window !== 'undefined' ? (localStorage.getItem('diff-checker-right') ?? '') : ''
    );
    const [leftLines, setLeftLines] = useState<LineInfo[]>([]);
    const [rightLines, setRightLines] = useState<LineInfo[]>([]);
    const [syncScrollEnabled, setSyncScrollEnabled] = useState(false);

    const leftRef = useRef<HTMLTextAreaElement>(null);
    const rightRef = useRef<HTMLTextAreaElement>(null);
    const leftGutterRef = useRef<HTMLDivElement>(null);
    const rightGutterRef = useRef<HTMLDivElement>(null);
    const leftOverlayRef = useRef<HTMLDivElement>(null);
    const rightOverlayRef = useRef<HTMLDivElement>(null);
    const diffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isSyncingRef = useRef(false);
    const syncScrollEnabledRef = useRef(false);

    useEffect(() => { localStorage.setItem('diff-checker-left', leftText); }, [leftText]);
    useEffect(() => { localStorage.setItem('diff-checker-right', rightText); }, [rightText]);

    useEffect(() => {
        syncScrollEnabledRef.current = syncScrollEnabled;
    }, [syncScrollEnabled]);

    useEffect(() => {
        if (diffTimerRef.current) clearTimeout(diffTimerRef.current);
        diffTimerRef.current = setTimeout(() => {
            const result = computeLineDiff(leftText, rightText);
            setLeftLines(result.leftLines);
            setRightLines(result.rightLines);
        }, 300);
        return () => {
            if (diffTimerRef.current) clearTimeout(diffTimerRef.current);
        };
    }, [leftText, rightText]);

    const syncScroll = useCallback((source: 'left' | 'right') => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;

        const sourceEl = source === 'left' ? leftRef.current : rightRef.current;
        const sourceGutter = source === 'left' ? leftGutterRef.current : rightGutterRef.current;
        const sourceOverlay = source === 'left' ? leftOverlayRef.current : rightOverlayRef.current;

        if (sourceGutter) sourceGutter.scrollTop = sourceEl?.scrollTop ?? 0;
        if (sourceOverlay) sourceOverlay.scrollTop = sourceEl?.scrollTop ?? 0;

        if (syncScrollEnabledRef.current) {
            const targetEl = source === 'left' ? rightRef.current : leftRef.current;
            const targetGutter = source === 'left' ? rightGutterRef.current : leftGutterRef.current;
            const targetOverlay = source === 'left' ? rightOverlayRef.current : leftOverlayRef.current;

            if (sourceEl && targetEl) {
                targetEl.scrollTop = sourceEl.scrollTop;
                targetEl.scrollLeft = sourceEl.scrollLeft;
            }
            if (targetGutter) targetGutter.scrollTop = sourceEl?.scrollTop ?? 0;
            if (targetOverlay) targetOverlay.scrollTop = sourceEl?.scrollTop ?? 0;
        }

        requestAnimationFrame(() => {
            isSyncingRef.current = false;
        });
    }, []);

    function mergeToRight(chunkId: number) {
        const removed = leftLines
            .filter((l) => l.chunkId === chunkId && l.type === 'removed')
            .map((l) => l.text)
            .join('\n');

        const added = rightLines
            .filter((l) => l.chunkId === chunkId && l.type === 'added')
            .map((l) => l.text)
            .join('\n');

        setRightText((prev) => {
            if (!added) return prev + (prev ? '\n' : '') + removed;
            return prev.replace(added, removed);
        });
    }

    function mergeToLeft(chunkId: number) {
        const added = rightLines
            .filter((l) => l.chunkId === chunkId && l.type === 'added')
            .map((l) => l.text)
            .join('\n');

        const removed = leftLines
            .filter((l) => l.chunkId === chunkId && l.type === 'removed')
            .map((l) => l.text)
            .join('\n');

        setLeftText((prev) => {
            if (!removed) return prev + (prev ? '\n' : '') + added;
            return prev.replace(removed, added);
        });
    }

    function handleClear() {
        setLeftText('');
        setRightText('');
    }

    function handleSwap() {
        setLeftText(rightText);
        setRightText(leftText);
    }

    const leftLineCount = leftText === '' ? 1 : leftText.split('\n').length;
    const rightLineCount = rightText === '' ? 1 : rightText.split('\n').length;

    function getLineClass(type: LineInfo['type']) {
        if (type === 'removed') return styles.lineRemoved;
        if (type === 'added') return styles.lineAdded;
        if (type === 'empty') return styles.lineEmpty;
        return '';
    }

    const seenChunks = new Set<number>();

    return (
        <div className={styles.wrapper}>
            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>Diff Checker</span>
                <div className={styles.toolbarActions}>
                    <label id="diff-sync-label" className={styles.syncLabel}>
                        <input
                            id="diff-sync-scroll"
                            type="checkbox"
                            className={styles.syncCheckbox}
                            checked={syncScrollEnabled}
                            onChange={(e) => setSyncScrollEnabled(e.target.checked)}
                        />
                        Scroll together
                    </label>
                    <button id="diff-swap" className={styles.actionBtn} onClick={handleSwap}>
                        ⇄ Swap
                    </button>
                    <button id="diff-clear" className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={handleClear}>
                        ✕ Clear Both
                    </button>
                    <ThemeSelector />
                </div>
            </div>

            <div className={styles.editors}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>Original</div>
                    <div className={styles.editorArea}>
                        <div ref={leftGutterRef} className={styles.gutter}>
                            {Array.from({ length: leftLineCount }, (_, i) => (
                                <div key={i} className={styles.lineNumber}>{i + 1}</div>
                            ))}
                        </div>
                        <div className={styles.editorRelative}>
                            <div ref={leftOverlayRef} className={styles.overlay} aria-hidden="true">
                                {leftLines.map((line, i) => {
                                    let mergeBtn = null;
                                    if (line.chunkId !== null && line.type === 'removed' && !seenChunks.has(line.chunkId)) {
                                        seenChunks.add(line.chunkId);
                                        const id = line.chunkId;
                                        mergeBtn = (
                                            <button
                                                key={`merge-r-${id}`}
                                                className={styles.mergeBtn}
                                                onClick={() => mergeToRight(id)}
                                                title="Copy to right"
                                            >
                                                →
                                            </button>
                                        );
                                    }
                                    return (
                                        <div key={i} className={`${styles.overlayLine} ${getLineClass(line.type)}`}>
                                            {mergeBtn}
                                        </div>
                                    );
                                })}
                            </div>
                            <textarea
                                ref={leftRef}
                                id="diff-left"
                                className={styles.textarea}
                                value={leftText}
                                onChange={(e) => setLeftText(e.target.value)}
                                onScroll={() => syncScroll('left')}
                                spellCheck={false}
                                autoCorrect="off"
                                autoCapitalize="off"
                                autoComplete="off"
                                data-gramm="false"
                                placeholder="Original text..."
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.divider} />

                <div className={styles.panel}>
                    <div className={styles.panelHeader}>Modified</div>
                    <div className={styles.editorArea}>
                        <div ref={rightGutterRef} className={styles.gutter}>
                            {Array.from({ length: rightLineCount }, (_, i) => (
                                <div key={i} className={styles.lineNumber}>{i + 1}</div>
                            ))}
                        </div>
                        <div className={styles.editorRelative}>
                            <div ref={rightOverlayRef} className={styles.overlay} aria-hidden="true">
                                {rightLines.map((line, i) => {
                                    let mergeBtn = null;
                                    if (line.chunkId !== null && line.type === 'added') {
                                        const id = line.chunkId;
                                        const isFirst = rightLines.findIndex((l) => l.chunkId === id && l.type === 'added') === i;
                                        if (isFirst) {
                                            mergeBtn = (
                                                <button
                                                    key={`merge-l-${id}`}
                                                    className={styles.mergeBtn}
                                                    onClick={() => mergeToLeft(id)}
                                                    title="Copy to left"
                                                >
                                                    ←
                                                </button>
                                            );
                                        }
                                    }
                                    return (
                                        <div key={i} className={`${styles.overlayLine} ${getLineClass(line.type)}`}>
                                            {mergeBtn}
                                        </div>
                                    );
                                })}
                            </div>
                            <textarea
                                ref={rightRef}
                                id="diff-right"
                                className={styles.textarea}
                                value={rightText}
                                onChange={(e) => setRightText(e.target.value)}
                                onScroll={() => syncScroll('right')}
                                spellCheck={false}
                                autoCorrect="off"
                                autoCapitalize="off"
                                autoComplete="off"
                                data-gramm="false"
                                placeholder="Modified text..."
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.statusBar}>
                <span className={styles.statusItem}>Original: {leftLineCount} lines</span>
                <span className={styles.statusDivider}>|</span>
                <span className={styles.statusItem}>Modified: {rightLineCount} lines</span>
            </div>
        </div>
    );
}
