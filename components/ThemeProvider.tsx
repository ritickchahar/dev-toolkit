'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { themes, DEFAULT_THEME_ID, getTheme, type Theme } from '@/config/themes';
import { getSettingAction, setSettingAction } from '@/app/actions/settings';

interface ThemeContextType {
    theme: Theme;
    setTheme: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: getTheme(DEFAULT_THEME_ID),
    setTheme: () => { },
});

export function useTheme() {
    return useContext(ThemeContext);
}

function applyTheme(theme: Theme) {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.vars)) {
        root.style.setProperty(key, value);
    }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => getTheme(DEFAULT_THEME_ID));

    useEffect(() => {
        const stored = localStorage.getItem('dev-toolkit-theme');
        const t = getTheme(stored ?? DEFAULT_THEME_ID);
        setThemeState(t);
        applyTheme(t);
        getSettingAction('theme').then(dbVal => {
            if (dbVal && dbVal !== stored) {
                const dt = getTheme(dbVal);
                setThemeState(dt);
                applyTheme(dt);
                localStorage.setItem('dev-toolkit-theme', dbVal);
            }
        });
    }, []);

    function setTheme(id: string) {
        const t = getTheme(id);
        setThemeState(t);
        applyTheme(t);
        localStorage.setItem('dev-toolkit-theme', id);
        setSettingAction('theme', id);
    }

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export { themes };
