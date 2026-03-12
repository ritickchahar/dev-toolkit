'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import { themes } from '@/config/themes';
import styles from './Sidebar.module.css';
import { getSettingAction, setSettingAction } from '@/app/actions/settings';

interface Topic {
    name: string;
    slug: string;
}

const CACHE_KEY = 'dev-diary-topics';
const CACHE_TTL = 60 * 60 * 1000;
const README_URL = 'https://raw.githubusercontent.com/ritickchahar/dev-diary/main/README.md';

function parseReadme(readme: string): Topic[] {
    const lines = readme.split('\n').filter((l) => l.trim().startsWith('|'));
    const dataLines = lines.filter((l) => !l.includes('---')).slice(1);
    return dataLines.flatMap((line) => {
        const cols = line.split('|').map((c) => c.trim()).filter(Boolean);
        if (cols.length < 3) return [];
        const name = cols[0];
        const match = /\[.*?\]\((.*?\.md)\)/.exec(cols[2]);
        if (!match) return [];
        const slug = match[1].replace(/\.md$/, '');
        return [{ name, slug }];
    });
}

function getFreshCache(): Topic[] | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { topics, timestamp } = JSON.parse(raw) as { topics: Topic[]; timestamp: number };
        return Date.now() - timestamp < CACHE_TTL ? topics : null;
    } catch { return null; }
}

function getStaleCache(): Topic[] | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        return (JSON.parse(raw) as { topics: Topic[] }).topics ?? null;
    } catch { return null; }
}

function setCache(topics: Topic[]) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ topics, timestamp: Date.now() }));
    } catch { }
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
    { label: 'Writer', href: '/focus-writer', icon: '✎' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        getSettingAction('sidebar_collapsed').then(val => {
            if (val === 'true') setCollapsed(true);
        });
    }, []);
    const [notesOpen, setNotesOpen] = useState(() => pathname.startsWith('/notes/'));
    const [topics, setTopics] = useState<Topic[]>([]);
    const [topicsLoading, setTopicsLoading] = useState(true);
    const [topicsError, setTopicsError] = useState(false);

    function cycleTheme() {
        const idx = themes.findIndex((t) => t.id === theme.id);
        const next = themes[(idx + 1) % themes.length];
        setTheme(next.id);
    }

    useEffect(() => {
        const fresh = getFreshCache();
        if (fresh) {
            setTopics(fresh);
            setTopicsLoading(false);
            return;
        }
        fetch(README_URL)
            .then((res) => { if (!res.ok) throw new Error(); return res.text(); })
            .then((text) => {
                const parsed = parseReadme(text);
                setCache(parsed);
                setTopics(parsed);
                setTopicsLoading(false);
            })
            .catch(() => {
                const stale = getStaleCache();
                if (stale) {
                    setTopics(stale);
                } else {
                    setTopicsError(true);
                }
                setTopicsLoading(false);
            });
    }, []);

    return (
        <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
            <div className={styles.logo} onClick={cycleTheme} title="Click to cycle theme" style={{ cursor: 'pointer' }}>
                {collapsed ? (
                    <>
                        <span className={styles.logoText}>d</span>
                        <span className={styles.logoAccent}>t</span>
                    </>
                ) : (
                    <>
                        <span className={styles.logoText}>dev</span>
                        <span className={styles.logoDot}>-</span>
                        <span className={styles.logoAccent}>toolkit</span>
                    </>
                )}
            </div>

            <nav className={styles.nav}>
                {!collapsed && <div className={styles.navSection}>TOOLS</div>}
                {tools.map((tool) => (
                    <Link
                        key={tool.href}
                        href={tool.href}
                        className={`${styles.navItem} ${collapsed ? styles.navItemCollapsed : ''} ${pathname === tool.href ? styles.navItemActive : ''}`}
                        title={collapsed ? tool.label : undefined}
                    >
                        <span className={styles.navIcon}>{tool.icon}</span>
                        {!collapsed && <span>{tool.label}</span>}
                    </Link>
                ))}

                {!collapsed && (
                    <div className={styles.notesSectionWrapper}>
                        <button
                            className={styles.notesSectionBtn}
                            onClick={() => setNotesOpen((o) => !o)}
                        >
                            <span className={styles.navSection}>NOTES</span>
                            <span className={styles.notesChevron}>{notesOpen ? '▾' : '▸'}</span>
                        </button>

                        {notesOpen && (
                            <div className={styles.topicsList}>
                                {topicsLoading && (
                                    <span className={styles.topicsStatus}>Loading...</span>
                                )}
                                {topicsError && !topicsLoading && (
                                    <span className={styles.topicsStatus}>Could not load topics.</span>
                                )}
                                {!topicsLoading && topics.map((topic) => (
                                    <Link
                                        key={topic.slug}
                                        href={`/notes/${topic.slug}`}
                                        className={`${styles.navItem} ${styles.topicItem} ${pathname === `/notes/${topic.slug}` ? styles.navItemActive : ''}`}
                                    >
                                        <span className={styles.topicIcon}>–</span>
                                        <span>{topic.name}</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </nav>

            <button
                id="sidebar-toggle"
                className={styles.toggleBtn}
                onClick={() => setCollapsed((c) => { setSettingAction('sidebar_collapsed', String(!c)); return !c; })}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                {collapsed ? '›' : '‹'}
            </button>
        </aside>
    );
}
