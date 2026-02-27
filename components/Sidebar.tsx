'use client';

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

    return (
        <aside className={styles.sidebar}>
            <div className={styles.logo}>
                <span className={styles.logoText}>dev</span>
                <span className={styles.logoDot}>-</span>
                <span className={styles.logoAccent}>toolkit</span>
            </div>
            <nav className={styles.nav}>
                <div className={styles.navSection}>TOOLS</div>
                {tools.map((tool) => (
                    <Link
                        key={tool.href}
                        href={tool.href}
                        className={`${styles.navItem} ${pathname === tool.href ? styles.navItemActive : ''}`}
                    >
                        <span className={styles.navIcon}>{tool.icon}</span>
                        <span>{tool.label}</span>
                    </Link>
                ))}
            </nav>
        </aside>
    );
}
