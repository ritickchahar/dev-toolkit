'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import { themes } from '@/config/themes';
import styles from './ThemeSelector.module.css';

export default function ThemeSelector() {
    const { theme, setTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    return (
        <div ref={wrapperRef} className={styles.wrapper}>
            <button
                id="theme-selector-btn"
                className={styles.triggerBtn}
                onClick={() => setOpen((o) => !o)}
                title="Change theme"
            >
                <span
                    className={styles.triggerSwatch}
                    style={{ background: theme.vars['--bg-primary'], outlineColor: theme.vars['--accent'] }}
                />
                <span className={styles.triggerLabel}>{theme.name}</span>
                <span className={styles.chevron}>{open ? '▴' : '▾'}</span>
            </button>

            {open && (
                <div className={styles.dropdown}>
                    {themes.map((t) => (
                        <button
                            key={t.id}
                            id={`theme-option-${t.id}`}
                            className={`${styles.option} ${t.id === theme.id ? styles.optionActive : ''}`}
                            onClick={() => { setTheme(t.id); setOpen(false); }}
                        >
                            <span className={styles.swatchPair}>
                                <span className={styles.swatchBg} style={{ background: t.vars['--bg-primary'] }} />
                                <span className={styles.swatchAccent} style={{ background: t.vars['--accent'] }} />
                            </span>
                            <span className={styles.optionName}>{t.name}</span>
                            {t.id === theme.id && <span className={styles.checkmark}>✓</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
