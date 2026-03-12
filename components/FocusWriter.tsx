'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './FocusWriter.module.css';
import {
    loadWriterAction, getChaptersAction,
    upsertProjectAction, deleteProjectAction,
    upsertChapterAction, deleteChapterAction,
    setWriterUiAction,
    addWriterImageAction, deleteWriterImageAction,
} from '@/app/actions/writer';
import type { WriterProject, WriterChapter, WriterUi } from '@/lib/dal/writer';
import type { BgImage } from '@/lib/dal/images';

const FONTS = ['Georgia', 'Times New Roman', 'Palatino', 'Inter', 'Arial', 'JetBrains Mono', 'Courier New'];
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32];

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function countWords(text: string) { const t = text.trim(); return t ? t.split(/\s+/).length : 0; }

function makeProject(name: string): WriterProject {
    const now = new Date().toISOString();
    return { id: genId(), name, mode: 'prose', font: 'Georgia', fontSize: 18, dailyGoal: 0, createdAt: now, updatedAt: now };
}

function makeChapter(projectId: string, title: string, ord: number): WriterChapter {
    return { id: genId(), projectId, title, content: '', ord };
}

export default function FocusWriter() {
    const [projects, setProjects] = useState<WriterProject[]>([]);
    const [chapters, setChapters] = useState<WriterChapter[]>([]);
    const [ui, setUi] = useState<WriterUi>({
        editorOpacity: 0.82, editorPosition: 'center', editorWidth: 780,
        editorHeight: 100, editorRadius: 12, bgBlur: 0, bgDim: 35,
        activeBgId: '', activeProjectId: '', activeChapterId: '',
    });
    const [images, setImages] = useState<BgImage[]>([]);
    const [loaded, setLoaded] = useState(false);

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
    const [newImageUrl, setNewImageUrl] = useState('');
    const [newImageLabel, setNewImageLabel] = useState('');

    const editorRef = useRef<HTMLDivElement>(null);
    const saveTimer = useRef<ReturnType<typeof setTimeout>>();
    const uiRef = useRef(ui);
    uiRef.current = ui;
    const chaptersRef = useRef(chapters);
    chaptersRef.current = chapters;

    useEffect(() => {
        loadWriterAction().then(({ projects: ps, chapters: chs, ui: u, images: imgs }) => {
            if (ps.length === 0) {
                const p = makeProject('Untitled');
                const ch = makeChapter(p.id, 'Chapter 1', 0);
                setProjects([p]);
                setChapters([ch]);
                setUi(prev => ({ ...prev, ...u, activeProjectId: p.id, activeChapterId: ch.id }));
                setImages(imgs);
                upsertProjectAction(p);
                upsertChapterAction(ch);
                setWriterUiAction('activeProjectId', p.id);
                setWriterUiAction('activeChapterId', ch.id);
            } else {
                setProjects(ps);
                setChapters(chs);
                setUi(u);
                setImages(imgs);
            }
            setLoaded(true);
        });
    }, []);

    useEffect(() => {
        document.body.classList.toggle('focus-writer-active', focusMode);
        return () => { document.body.classList.remove('focus-writer-active'); };
    }, [focusMode]);

    const project = projects.find(p => p.id === ui.activeProjectId);
    const chapter = chapters.find(c => c.id === ui.activeChapterId);

    function updateUi<K extends keyof WriterUi>(key: K, value: WriterUi[K]) {
        setUi(prev => ({ ...prev, [key]: value }));
        setWriterUiAction(key, String(value));
    }

    function updateProject(field: keyof WriterProject, value: string | number) {
        if (!project) return;
        const updated: WriterProject = { ...project, [field]: value, updatedAt: new Date().toISOString() };
        setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
        upsertProjectAction(updated);
    }

    function flushContent() {
        if (!editorRef.current) return;
        const html = editorRef.current.innerHTML;
        const ch = chaptersRef.current.find(c => c.id === uiRef.current.activeChapterId);
        if (!ch) return;
        const updated = { ...ch, content: html };
        setChapters(prev => prev.map(c => c.id === updated.id ? updated : c));
        if (saveTimer.current) clearTimeout(saveTimer.current);
        upsertChapterAction(updated);
    }

    const saveContent = useCallback(() => {
        if (!editorRef.current) return;
        const text = editorRef.current.innerText || '';
        setWordCount(countWords(text));
        setCharCount(text.length);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            const html = editorRef.current?.innerHTML ?? '';
            const ch = chaptersRef.current.find(c => c.id === uiRef.current.activeChapterId);
            if (ch) upsertChapterAction({ ...ch, content: html });
        }, 500);
    }, []);

    useEffect(() => {
        if (!loaded || !editorRef.current) return;
        editorRef.current.innerHTML = chapter?.content ?? '';
        const text = editorRef.current.innerText || '';
        setWordCount(countWords(text));
        setCharCount(text.length);
    }, [ui.activeChapterId, ui.activeProjectId, loaded]);

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

    function addProject(name: string) {
        if (!name.trim()) return;
        flushContent();
        const p = makeProject(name.trim());
        const ch = makeChapter(p.id, 'Chapter 1', 0);
        setProjects(prev => [...prev, p]);
        setChapters([ch]);
        setUi(prev => ({ ...prev, activeProjectId: p.id, activeChapterId: ch.id }));
        upsertProjectAction(p);
        upsertChapterAction(ch);
        setWriterUiAction('activeProjectId', p.id);
        setWriterUiAction('activeChapterId', ch.id);
        setNewProjectName('');
    }

    function deleteProject(id: string) {
        flushContent();
        deleteProjectAction(id);
        const remaining = projects.filter(p => p.id !== id);
        if (remaining.length === 0) {
            const p = makeProject('Untitled');
            const ch = makeChapter(p.id, 'Chapter 1', 0);
            setProjects([p]);
            setChapters([ch]);
            setUi(prev => ({ ...prev, activeProjectId: p.id, activeChapterId: ch.id }));
            upsertProjectAction(p);
            upsertChapterAction(ch);
            setWriterUiAction('activeProjectId', p.id);
            setWriterUiAction('activeChapterId', ch.id);
        } else {
            setProjects(remaining);
            if (ui.activeProjectId === id) {
                const next = remaining[0];
                getChaptersAction(next.id).then(chs => {
                    const newChId = chs[0]?.id ?? '';
                    setChapters(chs);
                    setUi(prev => ({ ...prev, activeProjectId: next.id, activeChapterId: newChId }));
                    setWriterUiAction('activeProjectId', next.id);
                    setWriterUiAction('activeChapterId', newChId);
                });
            }
        }
    }

    function addChapter(title: string) {
        if (!title.trim() || !ui.activeProjectId) return;
        flushContent();
        const ch = makeChapter(ui.activeProjectId, title.trim(), chapters.length);
        setChapters(prev => [...prev, ch]);
        setUi(prev => ({ ...prev, activeChapterId: ch.id }));
        upsertChapterAction(ch);
        setWriterUiAction('activeChapterId', ch.id);
        setNewChapterTitle('');
    }

    function deleteChapter(id: string) {
        flushContent();
        deleteChapterAction(id);
        const remaining = chapters.filter(c => c.id !== id);
        if (remaining.length === 0) {
            const ch = makeChapter(ui.activeProjectId, 'Chapter 1', 0);
            upsertChapterAction(ch);
            setChapters([ch]);
            setUi(prev => ({ ...prev, activeChapterId: ch.id }));
            setWriterUiAction('activeChapterId', ch.id);
        } else {
            setChapters(remaining);
            if (ui.activeChapterId === id) {
                setUi(prev => ({ ...prev, activeChapterId: remaining[0].id }));
                setWriterUiAction('activeChapterId', remaining[0].id);
            }
        }
    }

    function switchChapter(chapterId: string) {
        flushContent();
        setUi(prev => ({ ...prev, activeChapterId: chapterId }));
        setWriterUiAction('activeChapterId', chapterId);
    }

    function switchProject(projectId: string) {
        flushContent();
        getChaptersAction(projectId).then(chs => {
            const newChId = chs[0]?.id ?? '';
            setChapters(chs);
            setUi(prev => ({ ...prev, activeProjectId: projectId, activeChapterId: newChId }));
            setWriterUiAction('activeProjectId', projectId);
            setWriterUiAction('activeChapterId', newChId);
        });
    }

    function renameChapter(id: string, title: string) {
        if (!title.trim()) return;
        const updated = chapters.map(c => c.id === id ? { ...c, title: title.trim() } : c);
        setChapters(updated);
        const ch = updated.find(c => c.id === id);
        if (ch) upsertChapterAction(ch);
        setEditingChapterId(null);
    }

    function moveChapter(id: string, direction: -1 | 1) {
        const idx = chapters.findIndex(c => c.id === id);
        const target = idx + direction;
        if (target < 0 || target >= chapters.length) return;
        const reordered = [...chapters];
        [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
        const updated = reordered.map((c, i) => ({ ...c, ord: i }));
        setChapters(updated);
        updated.forEach(c => upsertChapterAction(c));
    }

    function handleAddImage() {
        if (!newImageUrl.trim()) return;
        const img: BgImage = { id: genId(), url: newImageUrl.trim(), label: newImageLabel.trim(), addedAt: new Date().toISOString() };
        setImages(prev => [img, ...prev]);
        addWriterImageAction(img);
        setNewImageUrl('');
        setNewImageLabel('');
    }

    function handleDeleteImage(id: string) {
        setImages(prev => prev.filter(i => i.id !== id));
        deleteWriterImageAction(id);
        if (ui.activeBgId === id) updateUi('activeBgId', '');
    }

    const handleExport = useCallback((fmt: 'txt' | 'md' | 'json') => {
        if (!project) return;
        let content = '';
        let filename = '';
        if (fmt === 'json') {
            content = JSON.stringify({ ...project, chapters }, null, 2);
            filename = `${project.name}.json`;
        } else {
            content = chapters.map(ch => {
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
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }, [project, chapters]);

    const handleFind = useCallback(() => {
        if (findText) (window as Window & { find?: (s: string) => boolean }).find?.(findText);
    }, [findText]);

    const handleReplace = useCallback(() => {
        const sel = window.getSelection();
        if (sel?.toString() === findText) { document.execCommand('insertText', false, replaceText); saveContent(); }
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

    const activeBgUrl = images.find(img => img.id === ui.activeBgId)?.url;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));
    const chapterIndex = chapters.findIndex(c => c.id === ui.activeChapterId);

    if (!loaded || !project || !chapter) return null;

    return (
        <div
            className={styles.wrapper}
            style={{
                backgroundImage: activeBgUrl ? `url(${activeBgUrl})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
        >
            {activeBgUrl && (
                <div
                    className={styles.bgOverlay}
                    style={{
                        background: `rgba(0, 0, 0, ${ui.bgDim / 100})`,
                        backdropFilter: ui.bgBlur > 0 ? `blur(${ui.bgBlur}px)` : undefined,
                        WebkitBackdropFilter: ui.bgBlur > 0 ? `blur(${ui.bgBlur}px)` : undefined,
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
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('bold'); }} title="Bold"><b>B</b></button>
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('italic'); }} title="Italic"><i>I</i></button>
                        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); format('underline'); }} title="Underline"><u>U</u></button>
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
                                <select className={styles.toolSelect} onChange={e => { applyScreenplayElement(e.target.value); e.target.value = ''; }} defaultValue="">
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
                        <select className={styles.toolSelect} value={project.font} onChange={e => updateProject('font', e.target.value)}>
                            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                        <select className={styles.toolSelect} value={project.fontSize} onChange={e => updateProject('fontSize', parseInt(e.target.value))}>
                            {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
                        </select>
                        <button className={styles.toolBtn} onClick={() => setShowFind(f => !f)} title="Find">⌕</button>
                        <button className={styles.toolBtn} onClick={() => setFocusMode(true)} title="Focus Mode">◎</button>
                        <button className={styles.toolBtn} onClick={() => setShowSettings(s => !s)} title="Settings">⚙</button>
                        <select className={styles.toolSelect} onChange={e => { if (e.target.value) handleExport(e.target.value as 'txt' | 'md' | 'json'); e.target.value = ''; }} defaultValue="">
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
                    <input className={styles.findInput} value={findText} onChange={e => setFindText(e.target.value)} placeholder="Find..." autoFocus onKeyDown={e => e.key === 'Enter' && handleFind()} />
                    <input className={styles.findInput} value={replaceText} onChange={e => setReplaceText(e.target.value)} placeholder="Replace..." onKeyDown={e => e.key === 'Enter' && handleReplace()} />
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
                            {projects.map(p => (
                                <div
                                    key={p.id}
                                    className={`${styles.sidebarItem} ${p.id === ui.activeProjectId ? styles.sidebarItemActive : ''}`}
                                    onClick={() => switchProject(p.id)}
                                >
                                    <span className={styles.sidebarItemLabel}>{p.name}</span>
                                    {projects.length > 1 && (
                                        <button className={styles.sidebarDeleteBtn} onClick={e => { e.stopPropagation(); deleteProject(p.id); }}>×</button>
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
                            {chapters.map((c, i) => (
                                <div
                                    key={c.id}
                                    className={`${styles.sidebarItem} ${c.id === ui.activeChapterId ? styles.sidebarItemActive : ''}`}
                                    onClick={() => switchChapter(c.id)}
                                    onDoubleClick={() => { setEditingChapterId(c.id); setEditingChapterTitle(c.title); }}
                                >
                                    {editingChapterId === c.id ? (
                                        <input
                                            className={styles.sidebarRenameInput}
                                            value={editingChapterTitle}
                                            onChange={e => setEditingChapterTitle(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') renameChapter(c.id, editingChapterTitle); if (e.key === 'Escape') setEditingChapterId(null); }}
                                            onBlur={() => renameChapter(c.id, editingChapterTitle)}
                                            autoFocus
                                            onClick={e => e.stopPropagation()}
                                        />
                                    ) : (
                                        <span className={styles.sidebarItemLabel}>{c.title}</span>
                                    )}
                                    <div className={styles.sidebarItemActions}>
                                        {i > 0 && <button className={styles.sidebarMoveBtn} onClick={e => { e.stopPropagation(); moveChapter(c.id, -1); }}>↑</button>}
                                        {i < chapters.length - 1 && <button className={styles.sidebarMoveBtn} onClick={e => { e.stopPropagation(); moveChapter(c.id, 1); }}>↓</button>}
                                        <button className={styles.sidebarDeleteBtn} onClick={e => { e.stopPropagation(); deleteChapter(c.id); }}>×</button>
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
                    style={{ justifyContent: ui.editorPosition === 'left' ? 'flex-start' : ui.editorPosition === 'right' ? 'flex-end' : 'center' }}
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
                            background: `rgba(20, 20, 25, ${ui.editorOpacity})`,
                            maxWidth: `${ui.editorWidth}px`,
                            height: `${ui.editorHeight}%`,
                            borderRadius: `${ui.editorRadius}px`,
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
                                    <span className={styles.goalFill} style={{ width: `${Math.min(100, Math.round(wordCount / project.dailyGoal * 100))}%` }} />
                                </span>
                            </span>
                        </>
                    )}
                    <span className={styles.statusSpacer} />
                    <span className={styles.statusItem}>{project.mode === 'screenplay' ? 'Script' : 'Prose'}</span>
                    <span className={styles.statusDot}>·</span>
                    <span className={styles.statusItem}>Ch {chapterIndex + 1}/{chapters.length}</span>
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
                                Writing Mode
                                <select className={styles.settingsSelect} value={project.mode} onChange={e => updateProject('mode', e.target.value)}>
                                    <option value="prose">Prose (Novel / Story)</option>
                                    <option value="screenplay">Screenplay / Script</option>
                                </select>
                            </label>
                            <label className={styles.settingsLabel}>
                                Daily Word Goal
                                <input type="number" className={styles.settingsInput} value={project.dailyGoal || ''} onChange={e => updateProject('dailyGoal', parseInt(e.target.value) || 0)} placeholder="0 (disabled)" min="0" />
                            </label>
                            <div className={styles.settingsDivider} />
                            <label className={styles.settingsLabel}>
                                Editor Position
                                <div className={styles.positionBtns}>
                                    {(['left', 'center', 'right'] as const).map(pos => (
                                        <button key={pos} className={`${styles.positionBtn} ${ui.editorPosition === pos ? styles.positionBtnActive : ''}`} onClick={() => updateUi('editorPosition', pos)}>
                                            {pos === 'left' ? '⫷' : pos === 'center' ? '⊞' : '⫸'}
                                            <span>{pos.charAt(0).toUpperCase() + pos.slice(1)}</span>
                                        </button>
                                    ))}
                                </div>
                            </label>
                            <label className={styles.settingsLabel}>
                                Editor Width ({ui.editorWidth}px)
                                <input type="range" min="320" max="1400" step="20" value={ui.editorWidth} onChange={e => updateUi('editorWidth', parseInt(e.target.value))} className={styles.settingsRange} />
                            </label>
                            <label className={styles.settingsLabel}>
                                Editor Height ({ui.editorHeight}%)
                                <input type="range" min="20" max="100" step="5" value={ui.editorHeight} onChange={e => updateUi('editorHeight', parseInt(e.target.value))} className={styles.settingsRange} />
                            </label>
                            <label className={styles.settingsLabel}>
                                Corner Radius ({ui.editorRadius}px)
                                <input type="range" min="0" max="40" step="2" value={ui.editorRadius} onChange={e => updateUi('editorRadius', parseInt(e.target.value))} className={styles.settingsRange} />
                            </label>
                            <label className={styles.settingsLabel}>
                                Editor Opacity ({Math.round(ui.editorOpacity * 100)}%)
                                <input type="range" min="0.3" max="1" step="0.05" value={ui.editorOpacity} onChange={e => updateUi('editorOpacity', parseFloat(e.target.value))} className={styles.settingsRange} />
                            </label>
                            <div className={styles.settingsDivider} />
                            <label className={styles.settingsLabel}>
                                Background Blur ({ui.bgBlur}px)
                                <input type="range" min="0" max="40" step="1" value={ui.bgBlur} onChange={e => updateUi('bgBlur', parseInt(e.target.value))} className={styles.settingsRange} />
                            </label>
                            <label className={styles.settingsLabel}>
                                Background Dim ({ui.bgDim}%)
                                <input type="range" min="0" max="90" step="5" value={ui.bgDim} onChange={e => updateUi('bgDim', parseInt(e.target.value))} className={styles.settingsRange} />
                            </label>
                            <div className={styles.settingsDivider} />
                            <label className={styles.settingsLabel}>
                                Background Images
                                <div className={styles.imageAddRow}>
                                    <input className={styles.settingsInput} value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} placeholder="Image URL..." onKeyDown={e => e.key === 'Enter' && handleAddImage()} />
                                    <input className={styles.settingsInput} value={newImageLabel} onChange={e => setNewImageLabel(e.target.value)} placeholder="Label (optional)" onKeyDown={e => e.key === 'Enter' && handleAddImage()} />
                                    <button className={styles.imageAddBtn} onClick={handleAddImage}>Add</button>
                                </div>
                                {images.length > 0 ? (
                                    <div className={styles.imageGrid}>
                                        {images.map(img => (
                                            <div
                                                key={img.id}
                                                className={`${styles.imageTile} ${ui.activeBgId === img.id ? styles.imageTileActive : ''}`}
                                                onClick={() => updateUi('activeBgId', ui.activeBgId === img.id ? '' : img.id)}
                                                title={img.label || img.url}
                                            >
                                                <div className={styles.imageTileThumb} style={{ backgroundImage: `url(${img.url})` }} />
                                                <span className={styles.imageTileLabel}>{img.label || 'untitled'}</span>
                                                <button className={styles.imageTileDelete} onClick={e => { e.stopPropagation(); handleDeleteImage(img.id); }}>×</button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <span className={styles.imageEmpty}>No images added yet</span>
                                )}
                            </label>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
