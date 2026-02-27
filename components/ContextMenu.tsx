'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import styles from './ContextMenu.module.css';

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

function getCachedTopics(): Topic[] {
    try {
        const raw = localStorage.getItem('dev-diary-topics');
        if (!raw) return [];
        return (JSON.parse(raw) as { topics: Topic[] }).topics ?? [];
    } catch {
        return [];
    }
}

export default function ContextMenu() {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [topics, setTopics] = useState<Topic[]>([]);

    const close = useCallback(() => setVisible(false), []);

    useEffect(() => {
        function handleContextMenu(e: MouseEvent) {
            e.preventDefault();
            setTopics(getCachedTopics());

            const menuW = 228;
            const menuH = 420;
            const x = e.clientX + menuW > window.innerWidth ? e.clientX - menuW : e.clientX + 2;
            const y = e.clientY + menuH > window.innerHeight ? e.clientY - menuH : e.clientY + 2;

            setPos({ x: Math.max(4, x), y: Math.max(4, y) });
            setVisible(true);
        }

        document.addEventListener('contextmenu', handleContextMenu);
        return () => document.removeEventListener('contextmenu', handleContextMenu);
    }, []);

    useEffect(() => {
        if (!visible) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') close();
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [visible, close]);

    if (!visible) return null;

    return (
        <>
            <div
                className={styles.overlay}
                onClick={close}
                onContextMenu={(e) => { e.preventDefault(); close(); }}
            />
            <div className={styles.menu} style={{ left: pos.x, top: pos.y }}>
                <p className={styles.sectionLabel}>TOOLS</p>
                {tools.map((tool) => (
                    <Link
                        key={tool.href}
                        href={tool.href}
                        className={styles.item}
                        onClick={close}
                    >
                        <span className={styles.icon}>{tool.icon}</span>
                        <span>{tool.label}</span>
                    </Link>
                ))}

                {topics.length > 0 && (
                    <>
                        <p className={`${styles.sectionLabel} ${styles.sectionLabelSpaced}`}>NOTES</p>
                        <div className={styles.notesList}>
                            {topics.map((topic) => (
                                <Link
                                    key={topic.slug}
                                    href={`/notes/${topic.slug}`}
                                    className={styles.item}
                                    onClick={close}
                                >
                                    <span className={styles.noteIcon}>–</span>
                                    <span>{topic.name}</span>
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
