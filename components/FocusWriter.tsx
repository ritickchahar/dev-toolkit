'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './FocusWriter.module.css';

const STORAGE_KEY = 'dev-toolkit-focus-writer';

interface Chapter {
    id: string;
    title: string;
    content: string;
    order: number;
}

interface Project {
    id: string;
    name: string;
    mode: 'prose' | 'screenplay';
    chapters: Chapter[];
    backgroundUrl: string;
    font: string;
    fontSize: number;
    dailyGoal: number;
    createdAt: string;
    updatedAt: string;
}

interface AppState {
    projects: Project[];
    activeProjectId: string;
    activeChapterId: string;
    editorOpacity: number;
    editorPosition: 'left' | 'center' | 'right';
    editorWidth: number;
    editorHeight: number;
    editorRadius: number;
    bgBlur: number;
    bgDim: number;
}

const FONTS = ['Georgia', 'Times New Roman', 'Palatino', 'Inter', 'Arial', 'JetBrains Mono', 'Courier New'];
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32];

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function newChapter(title: string, order: number): Chapter {
    return { id: genId(), title, content: '', order };
}

function newProject(name: string): Project {
    const ch = newChapter('Chapter 1', 0);
    return {
        id: genId(), name, mode: 'prose',
        chapters: [ch], backgroundUrl: '',
        font: 'Georgia', fontSize: 18, dailyGoal: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function loadState(): AppState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* noop */ }
    const p = newProject('Untitled');
    return { projects: [p], activeProjectId: p.id, activeChapterId: p.chapters[0].id, editorOpacity: 0.82, editorPosition: 'center', editorWidth: 780, editorHeight: 100, editorRadius: 12, bgBlur: 0, bgDim: 35 };
}

function countWords(text: string): number {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
}

export default function FocusWriter() {
    const [state, setState] = useState<AppState>(() => loadState());
    const [showSidebar, setShowSidebar] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showFind, setShowFind] = useState(false);
    const [focusMode, setFocusMode] = useState(false);
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [wordCount, setWordCount] = useState(0);
    const [charCount, setCharCount] = useState(0);
    const [newProjectName, setNewProjectName] = useState('');
    const [newChapterTitle, setNewChapterTitle] = useState('');
    const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
    const [editingChapterTitle, setEditingChapterTitle] = useState('');
    const editorRef = useRef<HTMLDivElement>(null);
    const saveTimer = useRef<ReturnType<typeof setTimeout>>();

    const project = state.projects.find(p => p.id === state.activeProjectId);
    const chapter = project?.chapters.find(c => c.id === state.activeChapterId);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
    }, [state]);

    const flushContent = useCallback(() => {
        if (!editorRef.current) return;
        const html = editorRef.current.innerHTML;
        setState(prev => {
            const next = JSON.parse(JSON.stringify(prev)) as AppState;
            const p = next.projects.find(p => p.id === next.activeProjectId);
            const c = p?.chapters.find(c => c.id === next.activeChapterId);
            if (c) c.content = html;
            if (p) p.updatedAt = new Date().toISOString();
            return next;
        });
    }, []);

    const saveContent = useCallback(() => {
        if (!editorRef.current) return;
        const text = editorRef.current.innerText || '';
        setWordCount(countWords(text));
        setCharCount(text.length);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(flushContent, 500);
    }, [flushContent]);

    useEffect(() => {
        if (editorRef.current && chapter) {
            editorRef.current.innerHTML = chapter.content;
            const text = editorRef.current.innerText || '';
            setWordCount(countWords(text));
            setCharCount(text.length);
        }
    }, [state.activeChapterId, state.activeProjectId]);

    const format = useCallback((cmd: string, value?: string) => {
        document.execCommand(cmd, false, value);
        editorRef.current?.focus();
        saveContent();
    }, [saveContent]);

    const applyScreenplayElement = useCallback((type: string) => {
        document.execCommand('formatBlock', false, 'div');
        const sel = window.getSelection();
        if (!sel?.anchorNode) return;
        let el = sel.anchorNode as HTMLElement;
        if (el.nodeType === 3) el = el.parentElement!;
        while (el && el !== editorRef.current && el.tagName !== 'DIV') el = el.parentElement!;
        if (!el || el === editorRef.current) return;

        el.removeAttribute('style');
        el.setAttribute('data-element', type);

        const map: Record<string, Record<string, string>> = {
            'scene-heading': { textTransform: 'uppercase', fontWeight: 'bold' },
            'character': { textTransform: 'uppercase', textAlign: 'center', paddingLeft: '25%' },
            'dialogue': { paddingLeft: '15%', paddingRight: '15%' },
            'parenthetical': { paddingLeft: '20%', paddingRight: '20%', fontStyle: 'italic' },
            'transition': { textTransform: 'uppercase', textAlign: 'right' },
        };
        if (map[type]) Object.assign(el.style, map[type]);
        saveContent();
    }, [saveContent]);

    const addProject = useCallback((name: string) => {
        if (!name.trim()) return;
        flushContent();
        const p = newProject(name.trim());
        setState(prev => ({
            ...prev,
            projects: [...prev.projects, p],
            activeProjectId: p.id,
            activeChapterId: p.chapters[0].id,
        }));
        setNewProjectName('');
    }, [flushContent]);

    const deleteProject = useCallback((id: string) => {
        setState(prev => {
            const projects = prev.projects.filter(p => p.id !== id);
            if (projects.length === 0) {
                const p = newProject('Untitled');
                return { ...prev, projects: [p], activeProjectId: p.id, activeChapterId: p.chapters[0].id };
            }
            if (prev.activeProjectId === id) {
                return { ...prev, projects, activeProjectId: projects[0].id, activeChapterId: projects[0].chapters[0].id };
            }
            return { ...prev, projects };
        });
    }, []);

    const addChapter = useCallback((title: string) => {
        if (!title.trim()) return;
        flushContent();
        const ch = newChapter(title.trim(), project?.chapters.length || 0);
        setState(prev => {
            const next = JSON.parse(JSON.stringify(prev)) as AppState;
            const p = next.projects.find(p => p.id === next.activeProjectId);
            if (p) p.chapters.push(ch);
            next.activeChapterId = ch.id;
            return next;
        });
        setNewChapterTitle('');
    }, [flushContent, project]);

    const deleteChapter = useCallback((id: string) => {
        setState(prev => {
            const next = JSON.parse(JSON.stringify(prev)) as AppState;
            const p = next.projects.find(p => p.id === next.activeProjectId);
            if (!p) return prev;
            p.chapters = p.chapters.filter(c => c.id !== id);
            if (p.chapters.length === 0) {
                const ch = newChapter('Chapter 1', 0);
                p.chapters = [ch];
                next.activeChapterId = ch.id;
            } else if (next.activeChapterId === id) {
                next.activeChapterId = p.chapters[0].id;
            }
            return next;
        });
    }, []);

    const switchChapter = useCallback((chapterId: string) => {
        flushContent();
        setState(prev => ({ ...prev, activeChapterId: chapterId }));
    }, [flushContent]);

    const switchProject = useCallback((projectId: string) => {
        flushContent();
        setState(prev => {
            const targetProj = prev.projects.find(p => p.id === projectId);
            return {
                ...prev,
                activeProjectId: projectId,
                activeChapterId: targetProj?.chapters[0]?.id || '',
            };
        });
    }, [flushContent]);

    const renameChapter = useCallback((id: string, title: string) => {
        if (!title.trim()) return;
        setState(prev => {
            const next = JSON.parse(JSON.stringify(prev)) as AppState;
            const p = next.projects.find(p => p.id === next.activeProjectId);
            const c = p?.chapters.find(c => c.id === id);
            if (c) c.title = title.trim();
            return next;
        });
        setEditingChapterId(null);
    }, []);

    const moveChapter = useCallback((id: string, direction: -1 | 1) => {
        setState(prev => {
            const next = JSON.parse(JSON.stringify(prev)) as AppState;
            const p = next.projects.find(p => p.id === next.activeProjectId);
            if (!p) return prev;
            const idx = p.chapters.findIndex(c => c.id === id);
            const target = idx + direction;
            if (target < 0 || target >= p.chapters.length) return prev;
            [p.chapters[idx], p.chapters[target]] = [p.chapters[target], p.chapters[idx]];
            return next;
        });
    }, []);

    const updateProjectField = useCallback((field: string, value: string | number) => {
        setState(prev => {
            const next = JSON.parse(JSON.stringify(prev)) as AppState;
            const p = next.projects.find(p => p.id === next.activeProjectId);
            if (p) (p as Record<string, unknown>)[field] = value;
            return next;
        });
    }, []);

    const handleExport = useCallback((fmt: 'txt' | 'md' | 'json') => {
        if (!project) return;
        let content = '';
        let filename = '';

        if (fmt === 'json') {
            content = JSON.stringify(project, null, 2);
            filename = `${project.name}.json`;
        } else {
            content = project.chapters.map(ch => {
                const doc = new DOMParser().parseFromString(ch.content || '<p></p>', 'text/html');
                const text = doc.body.innerText;
                return fmt === 'md'
                    ? `# ${ch.title}\n\n${text}`
                    : `${ch.title}\n${'='.repeat(ch.title.length)}\n\n${text}`;
            }).join('\n\n---\n\n');
            filename = `${project.name}.${fmt}`;
        }

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }, [project]);

    const handleFind = useCallback(() => {
        if (findText) (window as Window & { find?: (s: string) => boolean }).find?.(findText);
    }, [findText]);

    const handleReplace = useCallback(() => {
        const sel = window.getSelection();
        if (sel?.toString() === findText) {
            document.execCommand('insertText', false, replaceText);
            saveContent();
        }
        handleFind();
    }, [findText, replaceText, handleFind, saveContent]);

    const handleReplaceAll = useCallback(() => {
        if (!editorRef.current || !findText) return;
        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        editorRef.current.innerHTML = editorRef.current.innerHTML.replace(new RegExp(escaped, 'g'), replaceText);
        saveContent();
    }, [findText, replaceText, saveContent]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setShowFind(f => !f); }
            if (e.ctrlKey && e.key === 'h') { e.preventDefault(); setShowFind(true); }
            if (e.ctrlKey && e.shiftKey && e.key === 'F') { e.preventDefault(); setFocusMode(f => !f); }
            if (e.key === 'Escape') {
                if (focusMode) setFocusMode(false);
                else if (showFind) setShowFind(false);
                else if (showSettings) setShowSettings(false);
                else if (showSidebar) setShowSidebar(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [focusMode, showFind, showSettings, showSidebar]);

    const readingTime = Math.max(1, Math.ceil(wordCount / 200));
    const chapterIndex = project?.chapters.findIndex(c => c.id === state.activeChapterId) ?? 0;

    if (!project || !chapter) return null;

    return (
        <div
            className={styles.wrapper}
            style={{
                backgroundImage: project.backgroundUrl ? `url(${project.backgroundUrl})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
        >
            {project.backgroundUrl && (
                <div
                    className={styles.bgOverlay}
                    style={{
                        background: `rgba(0, 0, 0, ${state.bgDim / 100})`,
                        backdropFilter: state.bgBlur > 0 ? `blur(${state.bgBlur}px)` : undefined,
                        WebkitBackdropFilter: state.bgBlur > 0 ? `blur(${state.bgBlur}px)` : undefined,
                    }}
                />
            )}

            {!focusMode && (
                <div className={styles.toolbar}>
                    <div className={styles.toolbarLeft}>
                        <button className={styles.toolBtn} onClick={() => setShowSidebar(s => !s)} title="Files">☰</button>
                        <span className={styles.breadcrumb}>
                            <span className={styles.projectName}>{project.name}</span>
                            <span className={styles.separator}>›</span>
                            <span className={styles.chapterName}>{chapter.title}</span>
                        </span>
                    </div>
                    <div className={styles.toolbarCenter}>
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('bold'); }} title="Bold (Ctrl+B)"><b>B</b></button>
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('italic'); }} title="Italic (Ctrl+I)"><i>I</i></button>
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('underline'); }} title="Underline (Ctrl+U)"><u>U</u></button>
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('strikeThrough'); }} title="Strikethrough"><s>S</s></button>
                        <span className={styles.toolDivider} />
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('formatBlock', 'h1'); }} title="Heading 1">H1</button>
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('formatBlock', 'h2'); }} title="Heading 2">H2</button>
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('formatBlock', 'h3'); }} title="Heading 3">H3</button>
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('formatBlock', 'p'); }} title="Paragraph">¶</button>
                        <span className={styles.toolDivider} />
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('justifyLeft'); }} title="Align Left">⫷</button>
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('justifyCenter'); }} title="Align Center">⊞</button>
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('justifyRight'); }} title="Align Right">⫸</button>
                        {project.mode === 'screenplay' && (
                            <>
                                <span className={styles.toolDivider} />
                                <select
                                    className={styles.toolSelect}
                                    onChange={e => { applyScreenplayElement(e.target.value); e.target.value = ''; }}
                                    defaultValue=""
                                >
                                    <option value="" disabled>Element</option>
                                    <option value="scene-heading">Scene Heading</option>
                                    <option value="action">Action</option>
                                    <option value="character">Character</option>
                                    <option value="dialogue">Dialogue</option>
                                    <option value="parenthetical">Parenthetical</option>
                                    <option value="transition">Transition</option>
                                </select>
                            </>
                        )}
                    </div>
                    <div className={styles.toolbarRight}>
                        <select
                            className={styles.toolSelect}
                            value={project.font}
                            onChange={e => updateProjectField('font', e.target.value)}
                        >
                            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                        <select
                            className={styles.toolSelect}
                            value={project.fontSize}
                            onChange={e => updateProjectField('fontSize', parseInt(e.target.value))}
                        >
                            {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
                        </select>
                        <button className={styles.toolBtn} onClick={() => setShowFind(f => !f)} title="Find (Ctrl+F)">⌕</button>
                        <button className={styles.toolBtn} onClick={() => setFocusMode(true)} title="Focus Mode">◎</button>
                        <button className={styles.toolBtn} onClick={() => setShowSettings(s => !s)} title="Settings">⚙</button>
                        <select
                            className={styles.toolSelect}
                            onChange={e => { if (e.target.value) handleExport(e.target.value as 'txt' | 'md' | 'json'); e.target.value = ''; }}
                            defaultValue=""
                        >
                            <option value="" disabled>Export</option>
                            <option value="txt">.txt</option>
                            <option value="md">.md</option>
                            <option value="json">.json</option>
                        </select>
                    </div>
                </div>
            )}

            {showFind && !focusMode && (
                <div className={styles.findBar}>
                    <input
                        className={styles.findInput}
                        value={findText}
                        onChange={e => setFindText(e.target.value)}
                        placeholder="Find..."
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleFind()}
                    />
                    <input
                        className={styles.findInput}
                        value={replaceText}
                        onChange={e => setReplaceText(e.target.value)}
                        placeholder="Replace..."
                        onKeyDown={e => e.key === 'Enter' && handleReplace()}
                    />
                    <button className={styles.findBtn} onClick={handleFind}>Find</button>
                    <button className={styles.findBtn} onClick={handleReplace}>Replace</button>
                    <button className={styles.findBtn} onClick={handleReplaceAll}>All</button>
                    <button className={styles.findClose} onClick={() => setShowFind(false)}>×</button>
                </div>
            )}

            <div className={styles.main}>
                {showSidebar && !focusMode && (
                    <div className={styles.sidebar}>
                        <div className={styles.sidebarSection}>
                            <div className={styles.sidebarHeader}>Projects</div>
                            {state.projects.map(p => (
                                <div
                                    key={p.id}
                                    className={`${styles.sidebarItem} ${p.id === state.activeProjectId ? styles.sidebarItemActive : ''}`}
                                    onClick={() => switchProject(p.id)}
                                >
                                    <span className={styles.sidebarItemLabel}>{p.name}</span>
                                    <span className={styles.sidebarItemMeta}>{p.chapters.length} ch</span>
                                    {state.projects.length > 1 && (
                                        <button
                                            className={styles.sidebarDeleteBtn}
                                            onClick={e => { e.stopPropagation(); deleteProject(p.id); }}
                                        >×</button>
                                    )}
                                </div>
                            ))}
                            <div className={styles.sidebarAddRow}>
                                <input
                                    className={styles.sidebarInput}
                                    value={newProjectName}
                                    onChange={e => setNewProjectName(e.target.value)}
                                    placeholder="New project..."
                                    onKeyDown={e => e.key === 'Enter' && addProject(newProjectName)}
                                />
                                <button className={styles.sidebarAddBtn} onClick={() => addProject(newProjectName)}>+</button>
                            </div>
                        </div>

                        <div className={styles.sidebarSection}>
                            <div className={styles.sidebarHeader}>Chapters</div>
                            {project.chapters.map((c, i) => (
                                <div
                                    key={c.id}
                                    className={`${styles.sidebarItem} ${c.id === state.activeChapterId ? styles.sidebarItemActive : ''}`}
                                    onClick={() => switchChapter(c.id)}
                                    onDoubleClick={() => { setEditingChapterId(c.id); setEditingChapterTitle(c.title); }}
                                >
                                    {editingChapterId === c.id ? (
                                        <input
                                            className={styles.sidebarRenameInput}
                                            value={editingChapterTitle}
                                            onChange={e => setEditingChapterTitle(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') renameChapter(c.id, editingChapterTitle);
                                                if (e.key === 'Escape') setEditingChapterId(null);
                                            }}
                                            onBlur={() => renameChapter(c.id, editingChapterTitle)}
                                            autoFocus
                                            onClick={e => e.stopPropagation()}
                                        />
                                    ) : (
                                        <span className={styles.sidebarItemLabel}>{c.title}</span>
                                    )}
                                    <div className={styles.sidebarItemActions}>
                                        {i > 0 && (
                                            <button className={styles.sidebarMoveBtn} onClick={e => { e.stopPropagation(); moveChapter(c.id, -1); }}>↑</button>
                                        )}
                                        {i < project.chapters.length - 1 && (
                                            <button className={styles.sidebarMoveBtn} onClick={e => { e.stopPropagation(); moveChapter(c.id, 1); }}>↓</button>
                                        )}
                                        <button
                                            className={styles.sidebarDeleteBtn}
                                            onClick={e => { e.stopPropagation(); deleteChapter(c.id); }}
                                        >×</button>
                                    </div>
                                </div>
                            ))}
                            <div className={styles.sidebarAddRow}>
                                <input
                                    className={styles.sidebarInput}
                                    value={newChapterTitle}
                                    onChange={e => setNewChapterTitle(e.target.value)}
                                    placeholder="New chapter..."
                                    onKeyDown={e => e.key === 'Enter' && addChapter(newChapterTitle)}
                                />
                                <button className={styles.sidebarAddBtn} onClick={() => addChapter(newChapterTitle)}>+</button>
                            </div>
                        </div>
                    </div>
                )}

                <div
                    className={styles.editorContainer}
                    style={{ justifyContent: state.editorPosition === 'left' ? 'flex-start' : state.editorPosition === 'right' ? 'flex-end' : 'center' }}
                >
                    <div
                        ref={editorRef}
                        className={styles.editor}
                        contentEditable
                        onInput={saveContent}
                        suppressContentEditableWarning
                        spellCheck
                        style={{
                            fontFamily: project.font,
                            fontSize: `${project.fontSize}px`,
                            background: `rgba(20, 20, 25, ${state.editorOpacity})`,
                            maxWidth: `${state.editorWidth}px`,
                            height: `${state.editorHeight}%`,
                            borderRadius: `${state.editorRadius}px`,
                        }}
                    />
                </div>
            </div>

            {!focusMode && (
                <div className={styles.statusBar}>
                    <span className={styles.statusItem}>{wordCount} words</span>
                    <span className={styles.statusDot}>·</span>
                    <span className={styles.statusItem}>{charCount} chars</span>
                    <span className={styles.statusDot}>·</span>
                    <span className={styles.statusItem}>~{readingTime} min read</span>
                    {project.dailyGoal > 0 && (
                        <>
                            <span className={styles.statusDot}>·</span>
                            <span className={styles.statusItem}>
                                Goal: {wordCount}/{project.dailyGoal}
                                <span className={styles.goalBar}>
                                    <span
                                        className={styles.goalFill}
                                        style={{ width: `${Math.min(100, Math.round(wordCount / project.dailyGoal * 100))}%` }}
                                    />
                                </span>
                            </span>
                        </>
                    )}
                    <span className={styles.statusSpacer} />
                    <span className={styles.statusItem}>{project.mode === 'screenplay' ? 'Script' : 'Prose'}</span>
                    <span className={styles.statusDot}>·</span>
                    <span className={styles.statusItem}>Ch {chapterIndex + 1}/{project.chapters.length}</span>
                </div>
            )}

            {focusMode && (
                <button className={styles.exitFocus} onClick={() => setFocusMode(false)} title="Exit Focus Mode (Esc)">×</button>
            )}

            {showSettings && (
                <div className={styles.settingsOverlay} onClick={() => setShowSettings(false)}>
                    <div className={styles.settingsModal} onClick={e => e.stopPropagation()}>
                        <div className={styles.settingsHeader}>
                            <span>Settings</span>
                            <button className={styles.settingsClose} onClick={() => setShowSettings(false)}>×</button>
                        </div>
                        <div className={styles.settingsBody}>
                            <label className={styles.settingsLabel}>
                                Background Image URL
                                <input
                                    className={styles.settingsInput}
                                    value={project.backgroundUrl}
                                    onChange={e => updateProjectField('backgroundUrl', e.target.value)}
                                    placeholder="https://images.unsplash.com/..."
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                Background Blur ({state.bgBlur}px)
                                <input
                                    type="range"
                                    min="0"
                                    max="40"
                                    step="1"
                                    value={state.bgBlur}
                                    onChange={e => setState(prev => ({ ...prev, bgBlur: parseInt(e.target.value) }))}
                                    className={styles.settingsRange}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                Background Dim ({state.bgDim}%)
                                <input
                                    type="range"
                                    min="0"
                                    max="90"
                                    step="5"
                                    value={state.bgDim}
                                    onChange={e => setState(prev => ({ ...prev, bgDim: parseInt(e.target.value) }))}
                                    className={styles.settingsRange}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                Editor Opacity ({Math.round(state.editorOpacity * 100)}%)
                                <input
                                    type="range"
                                    min="0.3"
                                    max="1"
                                    step="0.05"
                                    value={state.editorOpacity}
                                    onChange={e => setState(prev => ({ ...prev, editorOpacity: parseFloat(e.target.value) }))}
                                    className={styles.settingsRange}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                Writing Mode
                                <select
                                    className={styles.settingsSelect}
                                    value={project.mode}
                                    onChange={e => updateProjectField('mode', e.target.value)}
                                >
                                    <option value="prose">Prose (Novel / Story)</option>
                                    <option value="screenplay">Screenplay / Script</option>
                                </select>
                            </label>
                            <label className={styles.settingsLabel}>
                                Editor Position
                                <div className={styles.positionBtns}>
                                    {(['left', 'center', 'right'] as const).map(pos => (
                                        <button
                                            key={pos}
                                            className={`${styles.positionBtn} ${state.editorPosition === pos ? styles.positionBtnActive : ''}`}
                                            onClick={() => setState(prev => ({ ...prev, editorPosition: pos }))}
                                        >
                                            {pos === 'left' ? '⫷' : pos === 'center' ? '⊞' : '⫸'}
                                            <span>{pos.charAt(0).toUpperCase() + pos.slice(1)}</span>
                                        </button>
                                    ))}
                                </div>
                            </label>
                            <label className={styles.settingsLabel}>
                                Editor Width ({state.editorWidth}px)
                                <input
                                    type="range"
                                    min="320"
                                    max="1400"
                                    step="20"
                                    value={state.editorWidth}
                                    onChange={e => setState(prev => ({ ...prev, editorWidth: parseInt(e.target.value) }))}
                                    className={styles.settingsRange}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                Editor Height ({state.editorHeight}%)
                                <input
                                    type="range"
                                    min="20"
                                    max="100"
                                    step="5"
                                    value={state.editorHeight}
                                    onChange={e => setState(prev => ({ ...prev, editorHeight: parseInt(e.target.value) }))}
                                    className={styles.settingsRange}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                Corner Radius ({state.editorRadius}px)
                                <input
                                    type="range"
                                    min="0"
                                    max="40"
                                    step="2"
                                    value={state.editorRadius}
                                    onChange={e => setState(prev => ({ ...prev, editorRadius: parseInt(e.target.value) }))}
                                    className={styles.settingsRange}
                                />
                            </label>
                            <label className={styles.settingsLabel}>
                                Daily Word Goal
                                <input
                                    type="number"
                                    className={styles.settingsInput}
                                    value={project.dailyGoal || ''}
                                    onChange={e => updateProjectField('dailyGoal', parseInt(e.target.value) || 0)}
                                    placeholder="0 (disabled)"
                                    min="0"
                                />
                            </label>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
