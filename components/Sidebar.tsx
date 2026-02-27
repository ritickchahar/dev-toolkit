'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

const tools = [
    { label: 'Clipboard', href: '/clipboard', icon: '⧉' },
    { label: 'Diff', href: '/diff', icon: '⇄' },
    { label: 'JSON', href: '/json-formatter', icon: '{ }' },
    { label: 'Color', href: '/color-picker', icon: '◉' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    return (
        <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
            <div className={styles.logo}>
                {collapsed ? (
                    <span className={styles.logoAccent}>d</span>
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
            </nav>

            <button
                id="sidebar-toggle"
                className={styles.toggleBtn}
                onClick={() => setCollapsed((c) => !c)}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                {collapsed ? '›' : '‹'}
            </button>
        </aside>
    );
}
