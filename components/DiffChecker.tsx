'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { diff_match_patch, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL } from 'diff-match-patch';
import ThemeSelector from './ThemeSelector';
import { getSettingAction, setSettingAction } from '@/app/actions/settings';
import styles from './DiffChecker.module.css';

interface LineMark {
    type: 'removed' | 'added' | 'equal';
    chunkId: number | null;
}

interface Chunk {
    id: number;
    leftStart: number;
    leftEnd: number;
    rightStart: number;
    rightEnd: number;
}

interface DiffResult {
    leftMarks: LineMark[];
    rightMarks: LineMark[];
    chunks: Chunk[];
}

function computeLineDiff(left: string, right: string): DiffResult {
    const dmp = new diff_match_patch();
    const a = dmp.diff_linesToChars_(left, right);
    const diffs = dmp.diff_main(a.chars1, a.chars2, false);
    dmp.diff_charsToLines_(diffs, a.lineArray);

    const leftLineCount = left === '' ? 1 : left.split('\n').length;
    const rightLineCount = right === '' ? 1 : right.split('\n').length;

    const leftMarks: LineMark[] = Array.from({ length: leftLineCount }, () => ({ type: 'equal', chunkId: null }));
    const rightMarks: LineMark[] = Array.from({ length: rightLineCount }, () => ({ type: 'equal', chunkId: null }));
    const chunks: Chunk[] = [];

    let leftIdx = 0;
    let rightIdx = 0;
    let chunkId = 0;
    let pending: { leftStart: number; rightStart: number; hasRemoved: boolean; hasAdded: boolean } | null = null;

    function linesIn(text: string): number {
        if (text === '') return 0;
        const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
        return trimmed.split('\n').length;
    }

    function flushPending() {
        if (!pending) return;
        if (pending.hasRemoved || pending.hasAdded) {
            chunks.push({
                id: chunkId,
                leftStart: pending.leftStart,
                leftEnd: leftIdx,
                rightStart: pending.rightStart,
                rightEnd: rightIdx,
            });
            for (let i = pending.leftStart; i < leftIdx; i++) {
                leftMarks[i] = { type: 'removed', chunkId };
            }
            for (let i = pending.rightStart; i < rightIdx; i++) {
                rightMarks[i] = { type: 'added', chunkId };
            }
            chunkId++;
        }
        pending = null;
    }

    for (const [op, text] of diffs) {
        const count = linesIn(text);
        if (op === DIFF_EQUAL) {
            flushPending();
            leftIdx += count;
            rightIdx += count;
        } else {
            if (!pending) pending = { leftStart: leftIdx, rightStart: rightIdx, hasRemoved: false, hasAdded: false };
            if (op === DIFF_DELETE) {
                pending.hasRemoved = true;
                leftIdx += count;
            } else if (op === DIFF_INSERT) {
                pending.hasAdded = true;
                rightIdx += count;
            }
        }
    }
    flushPending();

    return { leftMarks, rightMarks, chunks };
}

function spliceLines(text: string, start: number, deleteCount: number, insert: string): string {
    const lines = text.split('\n');
    const insertLines = insert === '' ? [] : insert.split('\n');
    lines.splice(start, deleteCount, ...insertLines);
    return lines.join('\n');
}

function getChunkLines(text: string, start: number, end: number): string {
    if (start >= end) return '';
    const lines = text.split('\n');
    return lines.slice(start, end).join('\n');
}

export default function DiffChecker() {
    const [leftText, setLeftText] = useState('');
    const [rightText, setRightText] = useState('');
    const [diff, setDiff] = useState<DiffResult>({ leftMarks: [], rightMarks: [], chunks: [] });
    const [syncScrollEnabled, setSyncScrollEnabled] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const leftRef = useRef<HTMLTextAreaElement>(null);
    const rightRef = useRef<HTMLTextAreaElement>(null);
    const leftGutterRef = useRef<HTMLDivElement>(null);
    const rightGutterRef = useRef<HTMLDivElement>(null);
    const leftOverlayRef = useRef<HTMLDivElement>(null);
    const rightOverlayRef = useRef<HTMLDivElement>(null);
    const leftBtnLayerRef = useRef<HTMLDivElement>(null);
    const rightBtnLayerRef = useRef<HTMLDivElement>(null);
    const diffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isSyncingRef = useRef(false);
    const syncScrollEnabledRef = useRef(false);

    useEffect(() => {
        syncScrollEnabledRef.current = syncScrollEnabled;
    }, [syncScrollEnabled]);

    useEffect(() => {
        Promise.all([
            getSettingAction('diff_left'),
            getSettingAction('diff_right'),
            getSettingAction('diff_sync_scroll'),
        ]).then(([l, r, s]) => {
            if (l) setLeftText(l);
            if (r) setRightText(r);
            if (s === '1') setSyncScrollEnabled(true);
            setLoaded(true);
        });
    }, []);

    useEffect(() => {
        if (diffTimerRef.current) clearTimeout(diffTimerRef.current);
        diffTimerRef.current = setTimeout(() => {
            setDiff(computeLineDiff(leftText, rightText));
        }, 300);
        return () => {
            if (diffTimerRef.current) clearTimeout(diffTimerRef.current);
        };
    }, [leftText, rightText]);

    useEffect(() => {
        if (!loaded) return;
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => {
            setSettingAction('diff_left', leftText);
            setSettingAction('diff_right', rightText);
        }, 400);
        return () => {
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        };
    }, [leftText, rightText, loaded]);

    useEffect(() => {
        if (!loaded) return;
        setSettingAction('diff_sync_scroll', syncScrollEnabled ? '1' : '0');
    }, [syncScrollEnabled, loaded]);

    const syncScroll = useCallback((source: 'left' | 'right') => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;

        const sourceEl = source === 'left' ? leftRef.current : rightRef.current;
        const sourceGutter = source === 'left' ? leftGutterRef.current : rightGutterRef.current;
        const sourceOverlay = source === 'left' ? leftOverlayRef.current : rightOverlayRef.current;
        const sourceBtnLayer = source === 'left' ? leftBtnLayerRef.current : rightBtnLayerRef.current;
        const srcTop = sourceEl?.scrollTop ?? 0;

        if (sourceGutter) sourceGutter.scrollTop = srcTop;
        if (sourceOverlay) sourceOverlay.scrollTop = srcTop;
        if (sourceBtnLayer) sourceBtnLayer.style.transform = `translateY(${-srcTop}px)`;

        if (syncScrollEnabledRef.current) {
            const targetEl = source === 'left' ? rightRef.current : leftRef.current;
            const targetGutter = source === 'left' ? rightGutterRef.current : leftGutterRef.current;
            const targetOverlay = source === 'left' ? rightOverlayRef.current : leftOverlayRef.current;
            const targetBtnLayer = source === 'left' ? rightBtnLayerRef.current : leftBtnLayerRef.current;

            if (targetEl) {
                targetEl.scrollTop = srcTop;
                targetEl.scrollLeft = sourceEl?.scrollLeft ?? 0;
                const tgtTop = targetEl.scrollTop;
                if (targetGutter) targetGutter.scrollTop = tgtTop;
                if (targetOverlay) targetOverlay.scrollTop = tgtTop;
                if (targetBtnLayer) targetBtnLayer.style.transform = `translateY(${-tgtTop}px)`;
            }
        }

        requestAnimationFrame(() => {
            isSyncingRef.current = false;
        });
    }, []);

    function mergeToRight(chunkId: number) {
        const chunk = diff.chunks.find((c) => c.id === chunkId);
        if (!chunk) return;
        const removed = getChunkLines(leftText, chunk.leftStart, chunk.leftEnd);
        const deleteCount = chunk.rightEnd - chunk.rightStart;
        setRightText((prev) => spliceLines(prev, chunk.rightStart, deleteCount, removed));
    }

    function mergeToLeft(chunkId: number) {
        const chunk = diff.chunks.find((c) => c.id === chunkId);
        if (!chunk) return;
        const added = getChunkLines(rightText, chunk.rightStart, chunk.rightEnd);
        const deleteCount = chunk.leftEnd - chunk.leftStart;
        setLeftText((prev) => spliceLines(prev, chunk.leftStart, deleteCount, added));
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

    const stats = useMemo(() => {
        let added = 0;
        let removed = 0;
        for (const c of diff.chunks) {
            removed += c.leftEnd - c.leftStart;
            added += c.rightEnd - c.rightStart;
        }
        return { added, removed };
    }, [diff.chunks]);

    function getLineClass(type: LineMark['type']) {
        if (type === 'removed') return styles.lineRemoved;
        if (type === 'added') return styles.lineAdded;
        return '';
    }

    const leftChunkFirstLine = useMemo(() => {
        const map = new Map<number, number>();
        diff.leftMarks.forEach((m, i) => {
            if (m.chunkId !== null && !map.has(m.chunkId)) map.set(m.chunkId, i);
        });
        return map;
    }, [diff.leftMarks]);

    const rightChunkFirstLine = useMemo(() => {
        const map = new Map<number, number>();
        diff.rightMarks.forEach((m, i) => {
            if (m.chunkId !== null && !map.has(m.chunkId)) map.set(m.chunkId, i);
        });
        return map;
    }, [diff.rightMarks]);

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
                                {Array.from({ length: leftLineCount }, (_, i) => {
                                    const mark = diff.leftMarks[i] ?? { type: 'equal' as const, chunkId: null };
                                    return (
                                        <div key={i} className={`${styles.overlayLine} ${getLineClass(mark.type)}`} />
                                    );
                                })}
                            </div>
                            <div className={styles.buttonLayer}>
                                <div ref={leftBtnLayerRef} className={styles.buttonLayerInner} style={{ height: `${12 + leftLineCount * 21}px` }}>
                                    {Array.from({ length: leftLineCount }, (_, i) => {
                                        const mark = diff.leftMarks[i] ?? { type: 'equal' as const, chunkId: null };
                                        const showBtn = mark.chunkId !== null && leftChunkFirstLine.get(mark.chunkId) === i;
                                        if (!showBtn) return null;
                                        return (
                                            <button
                                                key={i}
                                                className={styles.mergeBtn}
                                                style={{ top: `${12 + i * 21}px` }}
                                                onClick={() => mergeToRight(mark.chunkId!)}
                                                aria-label={`Copy chunk at line ${i + 1} to right`}
                                                title="Copy chunk to right"
                                            >
                                                →
                                            </button>
                                        );
                                    })}
                                </div>
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
                                {Array.from({ length: rightLineCount }, (_, i) => {
                                    const mark = diff.rightMarks[i] ?? { type: 'equal' as const, chunkId: null };
                                    return (
                                        <div key={i} className={`${styles.overlayLine} ${getLineClass(mark.type)}`} />
                                    );
                                })}
                            </div>
                            <div className={styles.buttonLayer}>
                                <div ref={rightBtnLayerRef} className={styles.buttonLayerInner} style={{ height: `${12 + rightLineCount * 21}px` }}>
                                    {Array.from({ length: rightLineCount }, (_, i) => {
                                        const mark = diff.rightMarks[i] ?? { type: 'equal' as const, chunkId: null };
                                        const showBtn = mark.chunkId !== null && rightChunkFirstLine.get(mark.chunkId) === i;
                                        if (!showBtn) return null;
                                        return (
                                            <button
                                                key={i}
                                                className={`${styles.mergeBtn} ${styles.mergeBtnLeft}`}
                                                style={{ top: `${12 + i * 21}px` }}
                                                onClick={() => mergeToLeft(mark.chunkId!)}
                                                aria-label={`Copy chunk at line ${i + 1} to left`}
                                                title="Copy chunk to left"
                                            >
                                                ←
                                            </button>
                                        );
                                    })}
                                </div>
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
                <span className={styles.statusDivider}>|</span>
                <span className={styles.statusItem}>+{stats.added} −{stats.removed}</span>
            </div>
        </div>
    );
}
