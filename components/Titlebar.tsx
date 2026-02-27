'use client';

import ThemeSelector from './ThemeSelector';
import styles from './Titlebar.module.css';

interface TitlebarProps {
    title: string;
}

export default function Titlebar({ title }: TitlebarProps) {
    return (
        <div className={styles.titlebar}>
            <span className={styles.title}>{title}</span>
            <div className={styles.controls}>
                <ThemeSelector />
            </div>
        </div>
    );
}
