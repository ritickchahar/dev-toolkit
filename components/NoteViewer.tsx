'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from './ThemeProvider';
import styles from './NoteViewer.module.css';

const RAW_BASE = 'https://raw.githubusercontent.com/ritickchahar/dev-diary/main';

function getCachedNote(topic: string): string | null {
    try {
        const raw = localStorage.getItem(`dev-diary-note-${topic}`);
        if (!raw) return null;
        return (JSON.parse(raw) as { content: string }).content ?? null;
    } catch {
        return null;
    }
}

function setCachedNote(topic: string, content: string) {
    try {
        localStorage.setItem(`dev-diary-note-${topic}`, JSON.stringify({ content }));
    } catch { }
}

function getDisplayName(topic: string): string {
    try {
        const raw = localStorage.getItem('dev-diary-topics');
        if (!raw) return topic;
        const { topics } = JSON.parse(raw) as { topics: { slug: string; name: string }[] };
        return topics.find((t) => t.slug === topic)?.name ?? topic;
    } catch {
        return topic;
    }
}

interface NoteViewerProps {
    topic: string;
}

interface CodeBlockProps {
    language: string;
    theme: string;
    children: string;
}

function CodeBlock({ language, theme: activeTheme, children }: CodeBlockProps) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        await navigator.clipboard.writeText(children);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    return (
        <div className={styles.codeBlock}>
            <button className={styles.codeCopyBtn} onClick={handleCopy} title="Copy code">
                {copied ? '✓ Copied' : '⧉ Copy'}
            </button>
            <SyntaxHighlighter
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                style={(activeTheme === 'dark' ? vscDarkPlus : vs) as any}
                language={language}
                PreTag="div"
                customStyle={{ borderRadius: '4px', margin: '0', fontSize: '13px', lineHeight: '1.6' }}
            >
                {children}
            </SyntaxHighlighter>
        </div>
    );
}


export default function NoteViewer({ topic }: NoteViewerProps) {
    const { theme } = useTheme();
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [displayName, setDisplayName] = useState(topic);

    useEffect(() => {
        setContent(null);
        setLoading(true);
        setError(false);
        setDisplayName(getDisplayName(topic));

        const cached = getCachedNote(topic);
        if (cached) {
            setContent(cached);
            setLoading(false);
            return;
        }

        fetch(`${RAW_BASE}/${topic}.md`)
            .then((res) => {
                if (!res.ok) throw new Error('not ok');
                return res.text();
            })
            .then((text) => {
                setCachedNote(topic, text);
                setContent(text);
                setLoading(false);
            })
            .catch(() => {
                setError(true);
                setLoading(false);
            });
    }, [topic]);

    return (
        <div className={styles.wrapper}>
            <div className={styles.header}>
                <span className={styles.headerTitle}>{displayName}</span>
            </div>
            <div className={styles.content}>
                {loading && <div className={styles.stateMessage}>Loading...</div>}
                {error && !loading && (
                    <div className={styles.errorMessage}>
                        Could not load notes. Check your connection or try again.
                    </div>
                )}
                {content && !loading && (
                    <div className={styles.markdown}>
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                code(props) {
                                    const { className, children } = props;
                                    const match = /language-(\w+)/.exec(className ?? '');
                                    if (match) {
                                        return (
                                            <CodeBlock language={match[1]} theme={theme}>
                                                {String(children).replace(/\n$/, '')}
                                            </CodeBlock>
                                        );
                                    }
                                    return <code className={styles.inlineCode}>{children}</code>;
                                },
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                    </div>
                )}
            </div>
        </div>
    );
}
