import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import Sidebar from '@/components/Sidebar';
import ContextMenu from '@/components/ContextMenu';
import { themes, DEFAULT_THEME_ID } from '@/config/themes';

export const metadata: Metadata = {
  title: 'dev-toolkit',
  description: 'A lightweight, browser-based collection of tools built for developers.',
  icons: { icon: '/favicon.ico' },
};

const themesVarsMap = Object.fromEntries(themes.map((t) => [t.id, t.vars]));
const initScript = `(function(){var m=${JSON.stringify(themesVarsMap)};var id=localStorage.getItem('dev-toolkit-theme')||'${DEFAULT_THEME_ID}';var v=m[id]||m['${DEFAULT_THEME_ID}'];for(var k in v){document.documentElement.style.setProperty(k,v[k])}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
        <ThemeProvider>
          <ContextMenu />
          <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            <Sidebar />
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
