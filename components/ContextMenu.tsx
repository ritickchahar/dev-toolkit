'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './ContextMenu.module.css';

/**
 * Interface representing a note topic.
 */
interface Topic {
    name: string;
    slug: string;
}

const tools = [
    { label: 'Clipboard', href: '/clipboard', icon: '⧉' },
    { label: 'Diff', href: '/diff', icon: '⇄' },
    { label: 'JSON', href: '/json-formatter', icon: '{}' },
    { label: 'Color', href: '/color-picker', icon: '◉' },
    { label: 'Download', href: '/download', icon: '↓' },
    { label: 'JWT', href: '/jwt-decoder', icon: '⚿' },
    { label: 'Markdown', href: '/markdown-preview', icon: '¶' },
    { label: 'CSV', href: '/csv-viewer', icon: '▦' },
    { label: 'Notepad', href: '/notes-pad', icon: '≡' },
    { label: 'Pomodoro', href: '/pomodoro', icon: '◔' },
];

/**
 * Fetches the topics from local storage.
 * @returns An array of topics.
 */
function getCachedTopics(): Topic[] {
    try {
        const raw = localStorage.getItem('dev-diary-topics');
        if (!raw) return [];
        return (JSON.parse(raw) as { topics: Topic[] }).topics ?? [];
    } catch {
        return [];
    }
}

/**
 * Renders the context menu with a GTA V style weapon wheel design.
 */
export default function ContextMenu() {
    const router = useRouter();
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [topics, setTopics] = useState<Topic[]>([]);

    // UI State
    const [mode, setMode] = useState<'main' | 'notes'>('main');
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const [isOpenByAlt, setIsOpenByAlt] = useState(false);

    // Track mouse globally so Alt key can spawn it at cursor
    const mousePosRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const updateMousePos = (e: MouseEvent) => {
            mousePosRef.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener('mousemove', updateMousePos);
        return () => window.removeEventListener('mousemove', updateMousePos);
    }, []);

    const close = useCallback(() => {
        setVisible(false);
        setIsOpenByAlt(false);
    }, []);

    useEffect(() => {
        function handleContextMenu(e: MouseEvent) {
            e.preventDefault();
            setTopics(getCachedTopics());

            const screenW = window.innerWidth;
            const screenH = window.innerHeight;
            const x = Math.min(Math.max(e.clientX, 200), screenW - 200);
            const y = Math.min(Math.max(e.clientY, 200), screenH - 200);

            setPos({ x, y });
            setMode('main');
            setActiveIndex(null);
            setIsOpenByAlt(false);
            setVisible(true);
        }

        document.addEventListener('contextmenu', handleContextMenu);
        return () => document.removeEventListener('contextmenu', handleContextMenu);
    }, []);

    useEffect(() => {
        const handleKeyDownAlt = (e: KeyboardEvent) => {
            if (e.key === 'Alt' && !visible) {
                e.preventDefault();
                setTopics(getCachedTopics());

                const screenW = window.innerWidth;
                const screenH = window.innerHeight;

                // If mouse hadn't moved yet, default to center of the screen
                const mx = mousePosRef.current.x || screenW / 2;
                const my = mousePosRef.current.y || screenH / 2;

                const x = Math.min(Math.max(mx, 200), screenW - 200);
                const y = Math.min(Math.max(my, 200), screenH - 200);

                setPos({ x, y });
                setMode('main');
                setActiveIndex(null);
                setIsOpenByAlt(true);
                setVisible(true);
            }
        };

        const handleKeyUpAlt = (e: KeyboardEvent) => {
            if (e.key === 'Alt') {
                e.preventDefault();
                if (isOpenByAlt) {
                    close();
                }
            }
        };

        const handleBlur = () => {
            if (isOpenByAlt) {
                close();
            }
        };

        window.addEventListener('keydown', handleKeyDownAlt);
        window.addEventListener('keyup', handleKeyUpAlt);
        window.addEventListener('blur', handleBlur);

        return () => {
            window.removeEventListener('keydown', handleKeyDownAlt);
            window.removeEventListener('keyup', handleKeyUpAlt);
            window.removeEventListener('blur', handleBlur);
        };
    }, [visible, isOpenByAlt, close]);

    const allItems = mode === 'main'
        ? [
            ...tools.map(t => ({ ...t, type: 'tool' })),
            ...(topics.length > 0 ? [{ label: 'Notes', href: '#', icon: '☰', type: 'notes_menu' }] : [])
        ]
        : [
            { label: 'Back', href: '#', icon: '⮌', type: 'back' },
            ...topics.map((t) => ({
                label: t.name,
                href: `/notes/${t.slug}`,
                icon: t.name.split(' ')[0],
                type: 'topic'
            }))
        ];

    const handleExecuteItem = useCallback((item: typeof allItems[0]) => {
        if (item.type === 'notes_menu') {
            setMode('notes');
            setActiveIndex(null);
        } else if (item.type === 'back') {
            setMode('main');
            setActiveIndex(null);
        } else {
            router.push(item.href);
            close();
        }
    }, [router, close]);

    useEffect(() => {
        if (!visible) return;

        function onWheel(e: WheelEvent) {
            e.preventDefault();
            const total = allItems.length;
            if (total === 0) return;

            setActiveIndex(prev => {
                const current = prev === null ? 0 : prev;
                if (e.deltaY > 0) {
                    return (current + 1) % total;
                } else if (e.deltaY < 0) {
                    return (current - 1 + total) % total;
                }
                return current;
            });
        }

        function onKey(e: KeyboardEvent) {
            const total = allItems.length;
            if (e.key === 'Escape') {
                close();
                return;
            }
            if (e.key === 'Enter' && activeIndex !== null) {
                e.preventDefault();
                handleExecuteItem(allItems[activeIndex]);
                return;
            }

            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                if (total === 0) return;
                setActiveIndex(prev => {
                    const current = prev === null ? -1 : prev;
                    return (current + 1) % total;
                });
                return;
            }

            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                if (total === 0) return;
                setActiveIndex(prev => {
                    const current = prev === null ? 0 : prev;
                    return (current - 1 + total) % total;
                });
                return;
            }
        }

        document.addEventListener('wheel', onWheel, { passive: false });
        document.addEventListener('keydown', onKey);

        return () => {
            document.removeEventListener('wheel', onWheel);
            document.removeEventListener('keydown', onKey);
        };
    }, [visible, allItems, activeIndex, close, handleExecuteItem]);

    if (!visible) return null;

    const wheelRadius = mode === 'main' ? 140 : 100;
    const totalItems = allItems.length;

    const displayLabel = activeIndex !== null ? allItems[activeIndex]?.label : 'MENU';

    return (
        <>
            <div
                className={styles.overlay}
                onClick={(e) => {
                    if (activeIndex !== null) {
                        handleExecuteItem(allItems[activeIndex]);
                    } else {
                        close();
                    }
                }}
                onContextMenu={(e) => { e.preventDefault(); close(); }}
            />
            <div className={styles.wheelMenu} style={{ left: pos.x, top: pos.y }}>
                <div
                    className={styles.wheelBackground}
                    style={mode === 'notes' ? { transform: 'scale(0.75)' } : {}}
                />
                <div className={styles.wheelCenter}>
                    <span>{displayLabel}</span>
                </div>
                {allItems.map((item, index) => {
                    const angle = (index / totalItems) * 2 * Math.PI - Math.PI / 2;
                    const x = Math.cos(angle) * wheelRadius;
                    const y = Math.sin(angle) * wheelRadius;
                    const isActive = index === activeIndex;

                    return (
                        <Link
                            key={item.href + index}
                            href={item.href}
                            className={`${styles.wheelItem} ${isActive ? styles.activeItem : ''}`}
                            style={{
                                left: `${x}px`,
                                top: `${y}px`,
                            }}
                            onClick={(e) => {
                                e.preventDefault();
                                handleExecuteItem(item);
                            }}
                            onMouseEnter={() => setActiveIndex(index)}
                            onMouseLeave={() => {
                                if (activeIndex === index) setActiveIndex(null);
                            }}
                            title={item.label}
                        >
                            <span
                                className={styles.wheelIcon}
                                style={{ fontSize: item.icon.length > 2 ? '11px' : '22px' }}
                            >
                                {item.icon}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </>
    );
}
