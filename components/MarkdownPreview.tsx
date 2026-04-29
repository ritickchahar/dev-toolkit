'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import vscDarkPlus from 'react-syntax-highlighter/dist/cjs/styles/prism/vsc-dark-plus';
import vs from 'react-syntax-highlighter/dist/cjs/styles/prism/vs';
import { useTheme } from './ThemeProvider';
import ThemeSelector from './ThemeSelector';
import { getSettingAction, setSettingAction } from '@/app/actions/settings';
import styles from './MarkdownPreview.module.css';



const INSERTS = [
    { label: 'B', title: 'Bold', before: '**', after: '**' },
    { label: 'I', title: 'Italic', before: '*', after: '*' },
    { label: 'H', title: 'Heading', before: '## ', after: '' },
    { label: '<>', title: 'Code block', before: '```\n', after: '\n```' },
    { label: '🔗', title: 'Link', before: '[', after: '](url)' },
    { label: '—', title: 'List item', before: '- ', after: '' },
];

export default function MarkdownPreview() {
    const { theme } = useTheme();
    const [markdown, setMarkdown] = useState('');
    const [displayed, setDisplayed] = useState('');
    const [fullscreen, setFullscreen] = useState(false);
    const [copiedMd, setCopiedMd] = useState(false);
    const [copiedHtml, setCopiedHtml] = useState(false);
    const [lineCount, setLineCount] = useState(1);
    const [loaded, setLoaded] = useState(false);

    const editorRef = useRef<HTMLTextAreaElement>(null);
    const gutterRef = useRef<HTMLDivElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const persistRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        Promise.all([
            getSettingAction('md_content'),
            getSettingAction('md_fullscreen'),
        ]).then(([md, fs]) => {
            if (md) {
                setMarkdown(md);
                setLineCount(md.split('\n').length);
            }
            if (fs === '1') setFullscreen(true);
            setLoaded(true);
        });
    }, []);

    useEffect(() => {
        if (!loaded) return;
        if (persistRef.current) clearTimeout(persistRef.current);
        persistRef.current = setTimeout(() => {
            setSettingAction('md_content', markdown);
        }, 400);
        return () => { if (persistRef.current) clearTimeout(persistRef.current); };
    }, [markdown, loaded]);

    useEffect(() => {
        if (!loaded) return;
        setSettingAction('md_fullscreen', fullscreen ? '1' : '0');
    }, [fullscreen, loaded]);

    // Debounced preview update
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setDisplayed(markdown), 150);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [markdown]);

    // Sync gutter scroll
    const syncGutter = useCallback(() => {
        if (gutterRef.current && editorRef.current) {
            gutterRef.current.scrollTop = editorRef.current.scrollTop;
        }
    }, []);

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
        setMarkdown(e.target.value);
        setLineCount(e.target.value.split('\n').length);
    }

    // Quick insert at cursor
    function insert(before: string, after: string) {
        const ta = editorRef.current; if (!ta) return;
        const s = ta.selectionStart, e = ta.selectionEnd;
        const sel = markdown.substring(s, e);
        const newVal = markdown.substring(0, s) + before + sel + after + markdown.substring(e);
        setMarkdown(newVal);
        requestAnimationFrame(() => {
            ta.selectionStart = s + before.length;
            ta.selectionEnd = s + before.length + sel.length;
            ta.focus();
        });
    }

    function handleClear() {
        setMarkdown('');
        setLineCount(1);
    }

    function handleCopyMd() {
        navigator.clipboard.writeText(markdown).catch(() => { });
        setCopiedMd(true);
        setTimeout(() => setCopiedMd(false), 1500);
    }

    function handleCopyHtml() {
        if (!previewRef.current) return;
        navigator.clipboard.writeText(previewRef.current.innerHTML).catch(() => { });
        setCopiedHtml(true);
        setTimeout(() => setCopiedHtml(false), 1500);
    }

    // Stats
    const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
    const lines = markdown.split('\n').length;
    const readTime = Math.ceil(words / 200);

    return (
        <div className={styles.wrapper}>
            {/* Toolbar */}
            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>Markdown Preview</span>
                <div className={styles.toolbarActions}>
                    <button className={styles.actionBtn} onClick={handleClear}>✕ Clear</button>
                    <button className={styles.actionBtn} onClick={handleCopyMd}>
                        {copiedMd ? '✓ Copied' : '⧉ Copy Markdown'}
                    </button>
                    <ThemeSelector />
                </div>
            </div>

            <div className={styles.editors}>
                <div className={`${styles.panel} ${fullscreen ? styles.panelHidden : ''}`}>
                    <div className={styles.panelHeader}>
                        <span className={styles.panelLabel}>Markdown</span>
                        <div className={styles.insertBar}>
                            {INSERTS.map(({ label, title, before, after }) => (
                                <button
                                    key={label}
                                    className={styles.insertBtn}
                                    title={title}
                                    onClick={() => insert(before, after)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className={styles.editorArea}>
                        <div ref={gutterRef} className={styles.gutter}>
                            {Array.from({ length: lineCount }, (_, i) => (
                                <div key={i} className={styles.lineNum}>{i + 1}</div>
                            ))}
                        </div>
                        <textarea
                            ref={editorRef}
                            id="md-editor"
                            className={styles.textarea}
                            value={markdown}
                            onChange={handleChange}
                            onScroll={syncGutter}
                            spellCheck={false}
                            autoCorrect="off"
                            autoCapitalize="off"
                        />
                    </div>
                </div>

                <div className={`${styles.divider} ${fullscreen ? styles.dividerHidden : ''}`} />

                <div className={`${styles.panel} ${fullscreen ? styles.panelFull : ''}`}>
                    <div className={styles.panelHeader}>
                        <span className={styles.panelLabel}>Preview</span>
                        <div className={styles.panelHeaderActions}>
                            <button className={styles.actionBtn} onClick={handleCopyHtml}>
                                {copiedHtml ? '✓ Copied' : '⧉ Copy HTML'}
                            </button>
                            <button className={styles.actionBtn} onClick={() => setFullscreen(f => !f)}>
                                {fullscreen ? '⊠ Split' : '⊡ Full'}
                            </button>
                        </div>
                    </div>
                    <div className={styles.previewArea}>
                        <div ref={previewRef} className={styles.markdown}>
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    code(props) {
                                        const { className, children } = props;
                                        const match = /language-(\w+)/.exec(className ?? '');
                                        if (match) {
                                            return (
                                                <SyntaxHighlighter
                                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                    style={(theme.isDark ? vscDarkPlus : vs) as any}
                                                    language={match[1]}
                                                    PreTag="div"
                                                    customStyle={{ borderRadius: '4px', margin: '0', fontSize: '13px' }}
                                                >
                                                    {String(children).replace(/\n$/, '')}
                                                </SyntaxHighlighter>
                                            );
                                        }
                                        return <code className={styles.inlineCode}>{children}</code>;
                                    }
                                }}
                            >
                                {displayed}
                            </ReactMarkdown>
                        </div>
                    </div>
                </div>
            </div>

            {/* Status bar */}
            <div className={styles.statusBar}>
                <span className={styles.statusItem}>{words.toLocaleString()} words</span>
                <span className={styles.statusDivider}>|</span>
                <span className={styles.statusItem}>{lines} lines</span>
                <span className={styles.statusDivider}>|</span>
                <span className={styles.statusItem}>{readTime} min read</span>
            </div>
        </div>
    );
}
