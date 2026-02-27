'use client';

import { useTheme } from './ThemeProvider';
import styles from './Titlebar.module.css';

interface TitlebarProps {
    title: string;
}

export default function Titlebar({ title }: TitlebarProps) {
    const { theme, toggleTheme } = useTheme();

    return (
        <div className={styles.titlebar}>
            <span className={styles.title}>{title}</span>
            <div className={styles.controls}>
                <button
                    id="theme-toggle"
                    className={styles.themeToggle}
                    onClick={toggleTheme}
                    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                >
                    {theme === 'dark' ? '○' : '●'}
                    <span className={styles.themeLabel}>
                        {theme === 'dark' ? 'Light' : 'Dark'}
                    </span>
                </button>
            </div>
        </div>
    );
}
