'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    loadWriterAction, getChaptersAction,
    upsertProjectAction, deleteProjectAction,
    upsertChapterAction, deleteChapterAction,
    setWriterUiAction,
    addWriterImageAction, deleteWriterImageAction,
} from '@/app/actions/writer';
import { getSnapshotsAction, saveSnapshotAction, deleteSnapshotAction } from '@/app/actions/snapshots';
import { getSessionsAction, saveSessionAction } from '@/app/actions/sessions';
import type { WriterProject, WriterChapter, WriterUi } from '@/lib/dal/writer';
import type { BgImage } from '@/lib/dal/images';
import type { WriterSnapshot } from '@/lib/dal/snapshots';
import type { WriterSession } from '@/lib/dal/sessions';

const FONTS = ['Georgia', 'Times New Roman', 'Palatino', 'Inter', 'Arial', 'JetBrains Mono', 'Courier New'];
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32];
const STOP_WORDS = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','was','are','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','that','this','these','those','it','its','he','she','they','we','you','i','me','him','her','them','us','my','your','his','their','our','what','which','who','when','where','how','if','as','so','but','not','no','all','each','every','both','few','more','most','other','some','such','into','than','then','there','up','out','about','after','before','between','through','during','over','under','again','further','once']);

const SCREENPLAY_TRANSITIONS: Record<string, string> = {
    'scene-heading': 'action',
    'action': 'action',
    'character': 'dialogue',
    'dialogue': 'action',
    'parenthetical': 'dialogue',
    'transition': 'scene-heading',
};

const SCREENPLAY_STYLES: Record<string, React.CSSProperties> = {
    'scene-heading': { textTransform: 'uppercase', fontWeight: 'bold' },
    'character': { textTransform: 'uppercase', textAlign: 'center', paddingLeft: '25%' },
    'dialogue': { paddingLeft: '15%', paddingRight: '15%' },
    'parenthetical': { paddingLeft: '20%', paddingRight: '20%', fontStyle: 'italic' },
    'transition': { textTransform: 'uppercase', textAlign: 'right' },
};

interface TitlePageData {
    title: string;
    author: string;
    contact: string;
    draftDate: string;
    copyright: string;
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function countWords(text: string) { const t = text.trim(); return t ? t.split(/\s+/).length : 0; }
function todayStr() { return new Date().toISOString().slice(0, 10); }

function makeProject(name: string): WriterProject {
    const now = new Date().toISOString();
    return { id: genId(), name, mode: 'prose', font: 'Georgia', fontSize: 18, dailyGoal: 0, createdAt: now, updatedAt: now };
}

function makeChapter(projectId: string, title: string, ord: number): WriterChapter {
    return { id: genId(), projectId, title, content: '', ord };
}

/**
 * Extract unique character names from all chapter content.
 */
function extractCharacters(chapters: WriterChapter[]): string[] {
    const names = new Set<string>();
    chapters.forEach(ch => {
        const doc = new DOMParser().parseFromString(ch.content || '', 'text/html');
        doc.querySelectorAll('[data-element="character"]').forEach(el => {
            const n = el.textContent?.trim().toUpperCase();
            if (n) names.add(n);
        });
    });
    return Array.from(names).sort();
}

/**
 * Extract unique scene heading texts from all chapter content.
 */
function extractLocations(chapters: WriterChapter[]): string[] {
    const locs = new Set<string>();
    chapters.forEach(ch => {
        const doc = new DOMParser().parseFromString(ch.content || '', 'text/html');
        doc.querySelectorAll('[data-element="scene-heading"]').forEach(el => {
            const t = el.textContent?.trim().toUpperCase();
            if (t) locs.add(t);
        });
    });
    return Array.from(locs);
}

/**
 * Count word frequencies, excluding stop words, sorted by count descending.
 */
function buildWordFrequency(text: string): [string, number][] {
    const freq = new Map<string, number>();
    text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(w => {
        if (w.length > 2 && !STOP_WORDS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
    });
    return Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40);
}

/**
 * Convert Fountain plain-text screenplay format to internal HTML.
 */
function parseFountainToHtml(text: string): string {
    const lines = text.split('\n');
    const blocks: string[] = [];
    let i = 0;
    while (i < lines.length) {
        const raw = lines[i];
        const t = raw.trim();
        if (!t) { i++; continue; }
        if (/^(INT|EXT|INT\.\/EXT|I\/E)[\.\s]/i.test(t) || t.startsWith('.')) {
            const heading = t.startsWith('.') ? t.slice(1) : t;
            blocks.push(`<div data-element="scene-heading" style="text-transform:uppercase;font-weight:bold">${heading.toUpperCase()}</div>`);
        } else if (t.startsWith('>') && t.endsWith('<')) {
            blocks.push(`<div data-element="action" style="text-align:center">${t.slice(1, -1).trim()}</div>`);
        } else if (t.startsWith('>')) {
            blocks.push(`<div data-element="transition" style="text-transform:uppercase;text-align:right">${t.slice(1).trim()}</div>`);
        } else if (t.startsWith('(') && t.endsWith(')')) {
            blocks.push(`<div data-element="parenthetical" style="padding-left:20%;padding-right:20%;font-style:italic">${t}</div>`);
        } else if (t === t.toUpperCase() && !/[.,!?]/.test(t) && t.length < 40 && i + 1 < lines.length && lines[i + 1]?.trim()) {
            blocks.push(`<div data-element="character" style="text-transform:uppercase;text-align:center;padding-left:25%">${t}</div>`);
        } else {
            const lastEl = blocks[blocks.length - 1]?.match(/data-element="([\w-]+)"/)?.[1];
            if (lastEl === 'character' || lastEl === 'parenthetical' || lastEl === 'dialogue') {
                blocks.push(`<div data-element="dialogue" style="padding-left:15%;padding-right:15%">${t}</div>`);
            } else {
                blocks.push(`<div data-element="action">${t}</div>`);
            }
        }
        i++;
    }
    return blocks.join('');
}

/**
 * Convert internal chapter HTML to Fountain plain-text format.
 */
function chaptersToFountain(chapters: WriterChapter[], projectName: string): string {
    const lines: string[] = [`Title: ${projectName}`, `Author: `, ``, ``];
    chapters.forEach(ch => {
        const doc = new DOMParser().parseFromString(ch.content || '', 'text/html');
        Array.from(doc.body.children).forEach(el => {
            const type = (el as HTMLElement).dataset.element;
            const t = el.textContent?.trim() || '';
            if (!t) return;
            switch (type) {
                case 'scene-heading': lines.push('', t.toUpperCase(), ''); break;
                case 'action': lines.push(t, ''); break;
                case 'character': lines.push('', t.toUpperCase()); break;
                case 'dialogue': lines.push(t, ''); break;
                case 'parenthetical': lines.push(`(${t.replace(/[()]/g, '')})`); break;
                case 'transition': lines.push('', `> ${t.toUpperCase()}`, ''); break;
                default: lines.push(t, '');
            }
        });
    });
    return lines.join('\n');
}

/**
 * Generate print-ready HTML for screenplay PDF output.
 */
function buildPdfHtml(project: WriterProject, chapters: WriterChapter[], titlePage: TitlePageData): string {
    const titleHtml = titlePage.title ? `
        <div style="page-break-after:always;text-align:center;padding-top:200px;font-family:'Courier New',monospace">
            <h1 style="font-size:18pt;text-transform:uppercase;font-weight:bold">${titlePage.title}</h1>
            ${titlePage.author ? `<p style="margin-top:24pt">Written by<br>${titlePage.author}</p>` : ''}
            ${titlePage.draftDate ? `<p style="margin-top:12pt">${titlePage.draftDate}</p>` : ''}
            ${titlePage.contact ? `<p style="position:absolute;bottom:72pt;left:72pt;text-align:left">${titlePage.contact}</p>` : ''}
            ${titlePage.copyright ? `<p style="margin-top:12pt;font-size:10pt">${titlePage.copyright}</p>` : ''}
        </div>` : '';
    const bodyHtml = chapters.map(ch => {
        const doc = new DOMParser().parseFromString(ch.content || '', 'text/html');
        return Array.from(doc.body.children).map(el => {
            const type = (el as HTMLElement).dataset.element;
            const t = el.textContent?.trim() || '';
            if (!t) return '';
            switch (type) {
                case 'scene-heading': return `<p style="text-transform:uppercase;font-weight:bold;margin:1em 0 0.5em">${t}</p>`;
                case 'action': return `<p style="margin:0.5em 0">${t}</p>`;
                case 'character': return `<p style="text-align:center;margin-left:2.5in;margin-top:1em;text-transform:uppercase">${t}</p>`;
                case 'dialogue': return `<p style="margin:0 1.5in 0 1in">${t}</p>`;
                case 'parenthetical': return `<p style="margin:0 1.7in 0 1.2in;font-style:italic">${t}</p>`;
                case 'transition': return `<p style="text-align:right;text-transform:uppercase;margin:1em 0">${t}</p>`;
                default: return `<p style="margin:0.5em 0">${t}</p>`;
            }
        }).join('');
    }).join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        body{font-family:'Courier New',monospace;font-size:12pt;margin:0}
        .page{width:8.5in;margin:0 auto;padding:1in 1.5in 1in 1in}
        @media print{body{margin:0}@page{size:letter;margin:1in}}
    </style></head><body><div class="page">${titleHtml}${bodyHtml}</div></body></html>`;
}

/**
 * Trigger a browser file download with given content.
 */
function downloadBlob(content: string, filename: string, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

const S = {
    bar: 'relative z-10 flex items-center shrink-0 border-b border-white/[0.07]',
    barBg: { background: 'rgba(18,18,22,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as React.CSSProperties,
    btn: 'flex items-center justify-center h-7 min-w-[28px] px-1.5 rounded-md border border-transparent text-[#7a7a8a] text-[13px] cursor-pointer select-none transition-colors duration-100 hover:bg-white/[0.07] hover:text-[#c8c8d0] active:bg-white/[0.12]',
    btnActive: 'bg-white/[0.1] border-white/[0.1] text-[#c8c8d0]',
    divider: 'w-px h-4 bg-white/[0.1] mx-1 shrink-0',
    sel: 'h-7 px-2 bg-white/[0.06] border border-white/[0.1] rounded-md text-[#a0a0b0] text-[12px] cursor-pointer outline-none transition-colors duration-100 hover:bg-white/[0.1] hover:text-[#c8c8d0]',
    selOpt: { background: '#1a1a22', color: '#c8c8d0' },
    input: 'px-2.5 py-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg text-[#c8c8d0] text-[13px] outline-none transition-colors duration-150 placeholder:text-[#4a4a5a] focus:border-[#4fc1ff]/60 focus:bg-white/[0.07]',
    label: 'flex flex-col gap-2 text-[12px] text-[#7a7a8a] font-medium',
    range: 'w-full h-[3px] appearance-none bg-white/[0.1] rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#4fc1ff] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgba(79,193,255,0.2)]',
    overlay: 'fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4',
    modal: 'w-full flex flex-col overflow-hidden rounded-xl border border-white/[0.1] shadow-2xl',
    modalBg: { background: 'rgba(22,22,28,0.98)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as React.CSSProperties,
    modalHead: 'flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] shrink-0',
    modalBody: 'flex flex-col gap-4 p-5 overflow-y-auto',
    accentBtn: 'flex items-center justify-center px-4 py-2 bg-[#4fc1ff] text-[#0a0a12] rounded-lg text-[13px] font-semibold cursor-pointer border-none transition-all duration-100 hover:bg-[#72ceff] active:scale-95',
    ghostBtn: 'flex items-center justify-center px-3 py-1.5 bg-white/[0.06] text-[#a0a0b0] border border-white/[0.1] rounded-lg text-[12px] cursor-pointer transition-all duration-100 hover:bg-white/[0.1] hover:text-[#c8c8d0]',
    hr: 'border-none h-px bg-white/[0.06] shrink-0',
    sideItem: 'group flex items-center gap-2 px-3 py-[6px] cursor-pointer transition-colors duration-100 hover:bg-white/[0.05] min-h-[32px]',
    sideItemActive: 'bg-white/[0.08] border-l-2 border-[#4fc1ff]',
    sideInput: 'flex-1 px-2 py-1.5 bg-white/[0.05] border border-white/[0.07] rounded-md text-[#c8c8d0] text-[12px] outline-none transition-colors duration-150 placeholder:text-[#3a3a4a] focus:border-[#4fc1ff]/50',
};

export default function FocusWriter() {
    const [projects, setProjects] = useState<WriterProject[]>([]);
    const [chapters, setChapters] = useState<WriterChapter[]>([]);
    const [ui, setUi] = useState<WriterUi>({
        editorOpacity: 0.85, editorPosition: 'center', editorWidth: 760,
        editorHeight: 100, editorRadius: 10, bgBlur: 0, bgDim: 40,
        activeBgId: '', activeProjectId: '', activeChapterId: '',
    });
    const [images, setImages] = useState<BgImage[]>([]);
    const [loaded, setLoaded] = useState(false);

    const [showSidebar, setShowSidebar] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showFind, setShowFind] = useState(false);
    const [focusMode, setFocusMode] = useState(false);
    const [showBeatBoard, setShowBeatBoard] = useState(false);
    const [showSnapshots, setShowSnapshots] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [showWordScanner, setShowWordScanner] = useState(false);
    const [showTitlePage, setShowTitlePage] = useState(false);

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

    const [snapshots, setSnapshots] = useState<WriterSnapshot[]>([]);
    const [snapshotLabel, setSnapshotLabel] = useState('');
    const [sessions, setSessions] = useState<WriterSession[]>([]);

    const [sprintActive, setSprintActive] = useState(false);
    const [sprintTimeLeft, setSprintTimeLeft] = useState(0);
    const [sprintDuration, setSprintDuration] = useState(25);
    const [sprintStartWords, setSprintStartWords] = useState(0);

    const [titlePage, setTitlePage] = useState<TitlePageData>({ title: '', author: '', contact: '', draftDate: '', copyright: '' });

    const [acSuggestions, setAcSuggestions] = useState<string[]>([]);
    const [acIndex, setAcIndex] = useState(0);
    const [acPos, setAcPos] = useState({ top: 0, left: 0 });

    const [wordFreq, setWordFreq] = useState<[string, number][]>([]);

    const editorRef = useRef<HTMLDivElement>(null);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const uiRef = useRef(ui);
    uiRef.current = ui;
    const chaptersRef = useRef(chapters);
    chaptersRef.current = chapters;
    const wordCountRef = useRef(wordCount);
    wordCountRef.current = wordCount;
    const sessionStartRef = useRef(Date.now());
    const sessionStartWordsRef = useRef(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadWriterAction().then(({ projects: ps, chapters: chs, ui: u, images: imgs }) => {
            if (ps.length === 0) {
                const p = makeProject('Untitled');
                const ch = makeChapter(p.id, 'Chapter 1', 0);
                setProjects([p]); setChapters([ch]);
                setUi(prev => ({ ...prev, ...u, activeProjectId: p.id, activeChapterId: ch.id }));
                setImages(imgs);
                upsertProjectAction(p); upsertChapterAction(ch);
                setWriterUiAction('activeProjectId', p.id); setWriterUiAction('activeChapterId', ch.id);
            } else {
                setProjects(ps); setChapters(chs); setUi(u); setImages(imgs);
                getSnapshotsAction(u.activeProjectId).then(setSnapshots);
                getSessionsAction(u.activeProjectId).then(setSessions);
            }
            setLoaded(true);
        });
    }, []);

    useEffect(() => {
        document.body.classList.toggle('focus-writer-active', focusMode);
        return () => { document.body.classList.remove('focus-writer-active'); };
    }, [focusMode]);

    useEffect(() => {
        if (!sprintActive) return;
        if (sprintTimeLeft <= 0) { setSprintActive(false); return; }
        const id = setInterval(() => setSprintTimeLeft(t => { if (t <= 1) { setSprintActive(false); return 0; } return t - 1; }), 1000);
        return () => clearInterval(id);
    }, [sprintActive, sprintTimeLeft]);

    useEffect(() => {
        return () => {
            const diff = wordCountRef.current - sessionStartWordsRef.current;
            const dur = Math.round((Date.now() - sessionStartRef.current) / 1000);
            if (diff > 0 && uiRef.current.activeProjectId) {
                saveSessionAction({ id: genId(), projectId: uiRef.current.activeProjectId, date: todayStr(), wordsWritten: diff, durationSeconds: dur });
            }
        };
    }, []);

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
        sessionStartRef.current = Date.now();
        sessionStartWordsRef.current = countWords(text);
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
        const styles = SCREENPLAY_STYLES[type];
        if (styles) Object.assign(el.style, styles);
        saveContent();
    }, [saveContent]);

    function getCurrentElementType(): string | null {
        const sel = window.getSelection();
        if (!sel?.anchorNode) return null;
        let el = sel.anchorNode as HTMLElement;
        if (el.nodeType === 3) el = el.parentElement!;
        while (el && el !== editorRef.current) {
            if ((el as HTMLElement).dataset?.element) return (el as HTMLElement).dataset.element!;
            el = el.parentElement!;
        }
        return null;
    }

    function handleEditorKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
        if (acSuggestions.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setAcIndex(i => Math.min(i + 1, acSuggestions.length - 1)); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setAcIndex(i => Math.max(i - 1, 0)); return; }
            if (e.key === 'Tab' || (e.key === 'Enter' && acSuggestions.length > 0)) {
                if (e.key === 'Tab') e.preventDefault();
                completeAutocomplete(acSuggestions[acIndex]);
                return;
            }
            if (e.key === 'Escape') { setAcSuggestions([]); return; }
        }
        if (project?.mode !== 'screenplay') return;
        if (e.key === 'Enter') {
            const type = getCurrentElementType();
            if (!type) return;
            const next = SCREENPLAY_TRANSITIONS[type];
            if (next) setTimeout(() => applyScreenplayElement(next), 0);
        }
    }

    function handleEditorInput() {
        saveContent();
        if (project?.mode !== 'screenplay') return;
        const type = getCurrentElementType();
        if (type !== 'character' && type !== 'scene-heading') { setAcSuggestions([]); return; }
        const sel = window.getSelection();
        if (!sel?.anchorNode) return;
        let el = sel.anchorNode as HTMLElement;
        if (el.nodeType === 3) el = el.parentElement!;
        while (el && el !== editorRef.current && (el as HTMLElement).dataset?.element === undefined) el = el.parentElement!;
        const currentText = el?.textContent?.trim().toUpperCase() ?? '';
        if (!currentText) { setAcSuggestions([]); return; }
        const pool = type === 'character' ? extractCharacters(chaptersRef.current) : extractLocations(chaptersRef.current);
        const matches = pool.filter(s => s.startsWith(currentText) && s !== currentText);
        if (matches.length === 0) { setAcSuggestions([]); return; }
        setAcSuggestions(matches.slice(0, 6));
        setAcIndex(0);
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const editorRect = editorRef.current?.getBoundingClientRect();
        if (editorRect) setAcPos({ top: rect.bottom - editorRect.top + 4, left: rect.left - editorRect.left });
    }

    function completeAutocomplete(suggestion: string) {
        const sel = window.getSelection();
        if (!sel?.anchorNode) return;
        let el = sel.anchorNode as HTMLElement;
        if (el.nodeType === 3) el = el.parentElement!;
        while (el && el !== editorRef.current && (el as HTMLElement).dataset?.element === undefined) el = el.parentElement!;
        if (el && el !== editorRef.current) {
            el.textContent = suggestion;
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        setAcSuggestions([]);
        saveContent();
    }

    function addProject(name: string) {
        if (!name.trim()) return;
        flushContent();
        const p = makeProject(name.trim());
        const ch = makeChapter(p.id, 'Chapter 1', 0);
        setProjects(prev => [...prev, p]); setChapters([ch]);
        setUi(prev => ({ ...prev, activeProjectId: p.id, activeChapterId: ch.id }));
        upsertProjectAction(p); upsertChapterAction(ch);
        setWriterUiAction('activeProjectId', p.id); setWriterUiAction('activeChapterId', ch.id);
        setNewProjectName('');
        setSnapshots([]); setSessions([]);
    }

    function deleteProject(id: string) {
        flushContent(); deleteProjectAction(id);
        const remaining = projects.filter(p => p.id !== id);
        if (remaining.length === 0) {
            const p = makeProject('Untitled'); const ch = makeChapter(p.id, 'Chapter 1', 0);
            setProjects([p]); setChapters([ch]);
            setUi(prev => ({ ...prev, activeProjectId: p.id, activeChapterId: ch.id }));
            upsertProjectAction(p); upsertChapterAction(ch);
            setWriterUiAction('activeProjectId', p.id); setWriterUiAction('activeChapterId', ch.id);
        } else {
            setProjects(remaining);
            if (ui.activeProjectId === id) {
                const next = remaining[0];
                getChaptersAction(next.id).then(chs => {
                    const newChId = chs[0]?.id ?? '';
                    setChapters(chs); setUi(prev => ({ ...prev, activeProjectId: next.id, activeChapterId: newChId }));
                    setWriterUiAction('activeProjectId', next.id); setWriterUiAction('activeChapterId', newChId);
                    getSnapshotsAction(next.id).then(setSnapshots);
                    getSessionsAction(next.id).then(setSessions);
                });
            }
        }
    }

    function addChapter(title: string) {
        if (!title.trim() || !ui.activeProjectId) return;
        flushContent();
        const ch = makeChapter(ui.activeProjectId, title.trim(), chapters.length);
        setChapters(prev => [...prev, ch]); setUi(prev => ({ ...prev, activeChapterId: ch.id }));
        upsertChapterAction(ch); setWriterUiAction('activeChapterId', ch.id); setNewChapterTitle('');
    }

    function deleteChapter(id: string) {
        flushContent(); deleteChapterAction(id);
        const remaining = chapters.filter(c => c.id !== id);
        if (remaining.length === 0) {
            const ch = makeChapter(ui.activeProjectId, 'Chapter 1', 0);
            upsertChapterAction(ch); setChapters([ch]);
            setUi(prev => ({ ...prev, activeChapterId: ch.id })); setWriterUiAction('activeChapterId', ch.id);
        } else {
            setChapters(remaining);
            if (ui.activeChapterId === id) {
                setUi(prev => ({ ...prev, activeChapterId: remaining[0].id }));
                setWriterUiAction('activeChapterId', remaining[0].id);
            }
        }
    }

    function switchChapter(chapterId: string) {
        flushContent(); setUi(prev => ({ ...prev, activeChapterId: chapterId }));
        setWriterUiAction('activeChapterId', chapterId);
    }

    function switchProject(projectId: string) {
        flushContent();
        getChaptersAction(projectId).then(chs => {
            const newChId = chs[0]?.id ?? '';
            setChapters(chs); setUi(prev => ({ ...prev, activeProjectId: projectId, activeChapterId: newChId }));
            setWriterUiAction('activeProjectId', projectId); setWriterUiAction('activeChapterId', newChId);
            getSnapshotsAction(projectId).then(setSnapshots);
            getSessionsAction(projectId).then(setSessions);
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
        setChapters(updated); updated.forEach(c => upsertChapterAction(c));
    }

    function handleAddImage() {
        if (!newImageUrl.trim()) return;
        const img: BgImage = { id: genId(), url: newImageUrl.trim(), label: newImageLabel.trim(), addedAt: new Date().toISOString() };
        setImages(prev => [img, ...prev]); addWriterImageAction(img);
        setNewImageUrl(''); setNewImageLabel('');
    }

    function handleDeleteImage(id: string) {
        setImages(prev => prev.filter(i => i.id !== id)); deleteWriterImageAction(id);
        if (ui.activeBgId === id) updateUi('activeBgId', '');
    }

    function handleSaveSnapshot() {
        if (!project || !snapshotLabel.trim()) return;
        flushContent();
        const snap: WriterSnapshot = {
            id: genId(), projectId: project.id, label: snapshotLabel.trim(),
            contentJson: JSON.stringify(chaptersRef.current.map(c => ({ id: c.id, title: c.title, content: c.content, ord: c.ord }))),
            createdAt: new Date().toISOString(),
        };
        setSnapshots(prev => [snap, ...prev]);
        saveSnapshotAction(snap);
        setSnapshotLabel('');
    }

    function handleRestoreSnapshot(snap: WriterSnapshot) {
        if (!confirm(`Restore snapshot "${snap.label}"? Current content will be overwritten.`)) return;
        const restored: WriterChapter[] = JSON.parse(snap.contentJson).map((c: Omit<WriterChapter, 'projectId'>) => ({ ...c, projectId: snap.projectId }));
        setChapters(restored); restored.forEach(c => upsertChapterAction(c));
        const first = restored[0];
        if (first) { setUi(prev => ({ ...prev, activeChapterId: first.id })); setWriterUiAction('activeChapterId', first.id); }
    }

    function handleDeleteSnapshot(id: string) {
        setSnapshots(prev => prev.filter(s => s.id !== id)); deleteSnapshotAction(id);
    }

    function startSprint(minutes: number) {
        setSprintDuration(minutes); setSprintTimeLeft(minutes * 60);
        setSprintStartWords(wordCount); setSprintActive(true);
    }

    function handleExport(fmt: 'txt' | 'md' | 'json' | 'fountain' | 'pdf') {
        if (!project) return;
        if (fmt === 'pdf') {
            const html = buildPdfHtml(project, chapters, titlePage);
            const win = window.open('', '_blank');
            if (!win) return;
            win.document.write(html); win.document.close();
            win.onload = () => win.print();
            return;
        }
        if (fmt === 'fountain') {
            downloadBlob(chaptersToFountain(chapters, project.name), `${project.name}.fountain`);
            return;
        }
        if (fmt === 'json') {
            downloadBlob(JSON.stringify({ ...project, titlePage, chapters }, null, 2), `${project.name}.json`);
            return;
        }
        const content = chapters.map(ch => {
            const doc = new DOMParser().parseFromString(ch.content || '<p></p>', 'text/html');
            const text = doc.body.innerText;
            return fmt === 'md' ? `# ${ch.title}\n\n${text}` : `${ch.title}\n${'='.repeat(ch.title.length)}\n\n${text}`;
        }).join('\n\n---\n\n');
        downloadBlob(content, `${project.name}.${fmt}`);
    }

    function handleFountainImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !project) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const html = parseFountainToHtml(text);
            const ch = makeChapter(project.id, file.name.replace('.fountain', ''), chapters.length);
            ch.content = html;
            setChapters(prev => [...prev, ch]); upsertChapterAction(ch);
            switchChapter(ch.id);
        };
        reader.readAsText(file);
        e.target.value = '';
    }

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

    function openWordScanner() {
        const allText = chapters.map(ch => {
            const doc = new DOMParser().parseFromString(ch.content || '', 'text/html');
            return doc.body.innerText;
        }).join(' ');
        setWordFreq(buildWordFrequency(allText));
        setShowWordScanner(true);
    }

    function handleToolsMenu(val: string) {
        if (val === 'beatboard') setShowBeatBoard(true);
        else if (val === 'snapshots') setShowSnapshots(true);
        else if (val === 'stats') { getSessionsAction(ui.activeProjectId).then(setSessions); setShowStats(true); }
        else if (val === 'scanner') openWordScanner();
        else if (val === 'titlepage') setShowTitlePage(true);
        else if (val === 'import-fountain') fileInputRef.current?.click();
        else if (val === 'sprint15') startSprint(15);
        else if (val === 'sprint25') startSprint(25);
        else if (val === 'sprint45') startSprint(45);
    }

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setShowFind(f => !f); }
            if (e.ctrlKey && e.key === 'h') { e.preventDefault(); setShowFind(true); }
            if (e.ctrlKey && e.shiftKey && e.key === 'F') { e.preventDefault(); setFocusMode(f => !f); }
            if (e.key === 'Escape') {
                if (acSuggestions.length > 0) { setAcSuggestions([]); return; }
                if (focusMode) setFocusMode(false);
                else if (showFind) setShowFind(false);
                else if (showSettings) setShowSettings(false);
                else if (showSidebar) setShowSidebar(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [focusMode, showFind, showSettings, showSidebar, acSuggestions]);

    const activeBgUrl = images.find(img => img.id === ui.activeBgId)?.url;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));
    const chapterIndex = chapters.findIndex(c => c.id === ui.activeChapterId);
    const sprintMins = Math.floor(sprintTimeLeft / 60);
    const sprintSecs = sprintTimeLeft % 60;
    const totalProjectWords = chapters.reduce((acc, ch) => {
        const doc = new DOMParser().parseFromString(ch.content || '', 'text/html');
        return acc + countWords(doc.body.innerText);
    }, 0);

    if (!loaded || !project || !chapter) return null;

    return (
        <div
            className="relative flex flex-col h-full overflow-hidden"
            style={{
                background: '#0e0e14',
                backgroundImage: activeBgUrl ? `url(${activeBgUrl})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
            onClick={() => setAcSuggestions([])}
        >
            {activeBgUrl && (
                <div className="absolute inset-0 z-0 pointer-events-none" style={{
                    background: `rgba(0,0,0,${ui.bgDim / 100})`,
                    backdropFilter: ui.bgBlur > 0 ? `blur(${ui.bgBlur}px)` : undefined,
                    WebkitBackdropFilter: ui.bgBlur > 0 ? `blur(${ui.bgBlur}px)` : undefined,
                }} />
            )}

            {!focusMode && (
                <div className={`${S.bar} gap-1 px-2 h-11`} style={S.barBg}>
                    <button className={S.btn} onClick={() => setShowSidebar(s => !s)} title="Files (sidebar)">
                        <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="3" width="13" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="7" width="13" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="11" width="13" height="1.5" rx="0.75" fill="currentColor"/></svg>
                    </button>

                    <div className="flex items-center gap-1.5 min-w-0 px-1 mr-1 overflow-hidden">
                        <span className="text-[13px] font-medium text-[#c8c8d0] truncate max-w-[120px]">{project.name}</span>
                        <span className="text-[#3a3a4a] text-[11px]">/</span>
                        <span className="text-[12px] text-[#6a6a7a] truncate max-w-[100px]">{chapter.title}</span>
                    </div>

                    <div className={S.divider} />

                    <button className={S.btn} onMouseDown={e => { e.preventDefault(); format('bold'); }} title="Bold"><b style={{ fontFamily: 'serif', fontSize: '13px' }}>B</b></button>
                    <button className={S.btn} onMouseDown={e => { e.preventDefault(); format('italic'); }} title="Italic"><i style={{ fontFamily: 'serif', fontSize: '13px' }}>I</i></button>
                    <button className={S.btn} onMouseDown={e => { e.preventDefault(); format('underline'); }} title="Underline"><u style={{ fontSize: '12px' }}>U</u></button>
                    <button className={S.btn} onMouseDown={e => { e.preventDefault(); format('strikeThrough'); }} title="Strikethrough"><s style={{ fontSize: '12px' }}>S</s></button>

                    <div className={S.divider} />

                    <button className={S.btn} onMouseDown={e => { e.preventDefault(); format('formatBlock', 'h1'); }} title="Heading 1" style={{ fontSize: '11px', fontWeight: 700 }}>H1</button>
                    <button className={S.btn} onMouseDown={e => { e.preventDefault(); format('formatBlock', 'h2'); }} title="Heading 2" style={{ fontSize: '11px', fontWeight: 700 }}>H2</button>
                    <button className={S.btn} onMouseDown={e => { e.preventDefault(); format('formatBlock', 'h3'); }} title="Heading 3" style={{ fontSize: '11px', fontWeight: 700 }}>H3</button>
                    <button className={S.btn} onMouseDown={e => { e.preventDefault(); format('formatBlock', 'p'); }} title="Paragraph" style={{ fontSize: '14px' }}>¶</button>

                    <div className={S.divider} />

                    <button className={S.btn} onMouseDown={e => { e.preventDefault(); format('justifyLeft'); }} title="Align left">
                        <svg width="13" height="11" viewBox="0 0 13 11" fill="none"><rect x="0" y="0" width="13" height="1.5" rx="0.75" fill="currentColor"/><rect x="0" y="3" width="9" height="1.5" rx="0.75" fill="currentColor"/><rect x="0" y="6" width="13" height="1.5" rx="0.75" fill="currentColor"/><rect x="0" y="9" width="7" height="1.5" rx="0.75" fill="currentColor"/></svg>
                    </button>
                    <button className={S.btn} onMouseDown={e => { e.preventDefault(); format('justifyCenter'); }} title="Align center">
                        <svg width="13" height="11" viewBox="0 0 13 11" fill="none"><rect x="0" y="0" width="13" height="1.5" rx="0.75" fill="currentColor"/><rect x="2" y="3" width="9" height="1.5" rx="0.75" fill="currentColor"/><rect x="0" y="6" width="13" height="1.5" rx="0.75" fill="currentColor"/><rect x="3" y="9" width="7" height="1.5" rx="0.75" fill="currentColor"/></svg>
                    </button>
                    <button className={S.btn} onMouseDown={e => { e.preventDefault(); format('justifyRight'); }} title="Align right">
                        <svg width="13" height="11" viewBox="0 0 13 11" fill="none"><rect x="0" y="0" width="13" height="1.5" rx="0.75" fill="currentColor"/><rect x="4" y="3" width="9" height="1.5" rx="0.75" fill="currentColor"/><rect x="0" y="6" width="13" height="1.5" rx="0.75" fill="currentColor"/><rect x="6" y="9" width="7" height="1.5" rx="0.75" fill="currentColor"/></svg>
                    </button>

                    {project.mode === 'screenplay' && (
                        <>
                            <div className={S.divider} />
                            <select
                                className={S.sel}
                                style={{ minWidth: 110 }}
                                onChange={e => { applyScreenplayElement(e.target.value); e.target.value = ''; }}
                                defaultValue=""
                            >
                                <option value="" disabled style={S.selOpt}>Element</option>
                                <option value="scene-heading" style={S.selOpt}>Scene Heading</option>
                                <option value="action" style={S.selOpt}>Action</option>
                                <option value="character" style={S.selOpt}>Character</option>
                                <option value="dialogue" style={S.selOpt}>Dialogue</option>
                                <option value="parenthetical" style={S.selOpt}>Parenthetical</option>
                                <option value="transition" style={S.selOpt}>Transition</option>
                            </select>
                        </>
                    )}

                    <div className="flex-1" />

                    {sprintActive && (
                        <button
                            className="flex items-center gap-1.5 h-7 px-3 rounded-md border text-[12px] font-mono cursor-pointer transition-all"
                            style={{ background: 'rgba(79,193,255,0.1)', borderColor: 'rgba(79,193,255,0.3)', color: '#4fc1ff' }}
                            onClick={() => setSprintActive(false)}
                            title="Click to stop sprint"
                        >
                            <span>⏱</span>
                            <span>{sprintMins}:{String(sprintSecs).padStart(2, '0')}</span>
                            <span style={{ color: 'rgba(79,193,255,0.7)' }}>+{wordCount - sprintStartWords}w</span>
                        </button>
                    )}

                    <button className={S.btn} onClick={() => setShowFind(f => !f)} title="Find & Replace (Ctrl+F)">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                    </button>
                    <button className={S.btn} onClick={() => setFocusMode(true)} title="Focus Mode (Ctrl+Shift+F)">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 4V1.5A0.5 0.5 0 0 1 1.5 1H4M10 1H12.5A0.5 0.5 0 0 1 13 1.5V4M13 10V12.5A0.5 0.5 0 0 1 12.5 13H10M4 13H1.5A0.5 0.5 0 0 1 1 12.5V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </button>
                    <button className={S.btn} onClick={() => setShowSettings(s => !s)} title="Settings">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.636 2.636l1.061 1.061M10.303 10.303l1.061 1.061M11.364 2.636l-1.061 1.061M3.697 10.303l-1.061 1.061" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </button>

                    <div className={S.divider} />

                    <select className={S.sel} onChange={e => { if (e.target.value) handleToolsMenu(e.target.value); e.target.value = ''; }} defaultValue="">
                        <option value="" disabled style={S.selOpt}>Tools</option>
                        <option value="beatboard" style={S.selOpt}>Beat Board</option>
                        <option value="snapshots" style={S.selOpt}>Snapshots</option>
                        <option value="stats" style={S.selOpt}>Writing Stats</option>
                        <option value="scanner" style={S.selOpt}>Word Scanner</option>
                        <option value="titlepage" style={S.selOpt}>Title Page</option>
                        {!sprintActive && <option value="sprint15" style={S.selOpt}>Sprint 15 min</option>}
                        {!sprintActive && <option value="sprint25" style={S.selOpt}>Sprint 25 min</option>}
                        {!sprintActive && <option value="sprint45" style={S.selOpt}>Sprint 45 min</option>}
                        <option value="import-fountain" style={S.selOpt}>Import .fountain</option>
                    </select>

                    <select className={S.sel} onChange={e => { if (e.target.value) handleExport(e.target.value as 'txt' | 'md' | 'json' | 'fountain' | 'pdf'); e.target.value = ''; }} defaultValue="">
                        <option value="" disabled style={S.selOpt}>Export</option>
                        <option value="txt" style={S.selOpt}>.txt</option>
                        <option value="md" style={S.selOpt}>.md</option>
                        <option value="json" style={S.selOpt}>.json</option>
                        <option value="fountain" style={S.selOpt}>.fountain</option>
                        <option value="pdf" style={S.selOpt}>PDF (print)</option>
                    </select>
                </div>
            )}

            {showFind && !focusMode && (
                <div className={`${S.bar} gap-2 px-3 py-2`} style={S.barBg}>
                    <input className={S.input} style={{ width: 180 }} value={findText} onChange={e => setFindText(e.target.value)} placeholder="Find…" autoFocus onKeyDown={e => e.key === 'Enter' && handleFind()} />
                    <input className={S.input} style={{ width: 180 }} value={replaceText} onChange={e => setReplaceText(e.target.value)} placeholder="Replace…" onKeyDown={e => e.key === 'Enter' && handleReplace()} />
                    <button className={S.ghostBtn} onClick={handleFind}>Find</button>
                    <button className={S.ghostBtn} onClick={handleReplace}>Replace</button>
                    <button className={S.ghostBtn} onClick={handleReplaceAll}>All</button>
                    <button className="ml-auto w-6 h-6 flex items-center justify-center rounded text-[#6a6a7a] hover:text-[#c8c8d0] text-lg cursor-pointer bg-transparent border-none transition-colors" onClick={() => setShowFind(false)}>×</button>
                </div>
            )}

            <div className="relative z-[1] flex flex-1 min-h-0">
                {showSidebar && !focusMode && (
                    <div className="w-56 shrink-0 h-full flex flex-col overflow-y-auto border-r border-white/[0.07]" style={{ background: 'rgba(14,14,20,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
                        <div className="pt-3 pb-2 border-b border-white/[0.06]">
                            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#3a3a5a]">Projects</div>
                            {projects.map(p => (
                                <div key={p.id} className={`${S.sideItem} ${p.id === ui.activeProjectId ? S.sideItemActive : ''}`} onClick={() => switchProject(p.id)}>
                                    <span className="flex-1 text-[13px] text-[#b0b0c0] truncate">{p.name}</span>
                                    {projects.length > 1 && (
                                        <button className="opacity-0 group-hover:opacity-100 text-[#4a4a5a] hover:text-[#e06c75] text-base cursor-pointer bg-transparent border-none transition-all leading-none" onClick={e => { e.stopPropagation(); deleteProject(p.id); }}>×</button>
                                    )}
                                </div>
                            ))}
                            <div className="flex items-center gap-1.5 px-3 pt-2">
                                <input className={S.sideInput} value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="New project…" onKeyDown={e => e.key === 'Enter' && addProject(newProjectName)} />
                                <button className="w-6 h-6 flex items-center justify-center bg-[#4fc1ff] text-[#0a0a12] rounded-md text-sm font-bold shrink-0 cursor-pointer border-none hover:bg-[#72ceff] transition-colors" onClick={() => addProject(newProjectName)}>+</button>
                            </div>
                        </div>

                        <div className="pt-3 pb-2">
                            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#3a3a5a]">Chapters</div>
                            {chapters.map((c, i) => (
                                <div key={c.id} className={`${S.sideItem} ${c.id === ui.activeChapterId ? S.sideItemActive : ''}`} onClick={() => switchChapter(c.id)} onDoubleClick={() => { setEditingChapterId(c.id); setEditingChapterTitle(c.title); }}>
                                    {editingChapterId === c.id ? (
                                        <input
                                            className={S.sideInput}
                                            value={editingChapterTitle}
                                            onChange={e => setEditingChapterTitle(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') renameChapter(c.id, editingChapterTitle); if (e.key === 'Escape') setEditingChapterId(null); }}
                                            onBlur={() => renameChapter(c.id, editingChapterTitle)}
                                            autoFocus onClick={e => e.stopPropagation()}
                                        />
                                    ) : (
                                        <span className="flex-1 text-[13px] text-[#b0b0c0] truncate">{c.title}</span>
                                    )}
                                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {i > 0 && <button className="text-[#4a4a5a] hover:text-[#c8c8d0] text-[11px] px-0.5 bg-transparent border-none cursor-pointer" onClick={e => { e.stopPropagation(); moveChapter(c.id, -1); }}>↑</button>}
                                        {i < chapters.length - 1 && <button className="text-[#4a4a5a] hover:text-[#c8c8d0] text-[11px] px-0.5 bg-transparent border-none cursor-pointer" onClick={e => { e.stopPropagation(); moveChapter(c.id, 1); }}>↓</button>}
                                        <button className="text-[#4a4a5a] hover:text-[#e06c75] text-base px-0.5 bg-transparent border-none cursor-pointer leading-none" onClick={e => { e.stopPropagation(); deleteChapter(c.id); }}>×</button>
                                    </div>
                                </div>
                            ))}
                            <div className="flex items-center gap-1.5 px-3 pt-2">
                                <input className={S.sideInput} value={newChapterTitle} onChange={e => setNewChapterTitle(e.target.value)} placeholder="New chapter…" onKeyDown={e => e.key === 'Enter' && addChapter(newChapterTitle)} />
                                <button className="w-6 h-6 flex items-center justify-center bg-[#4fc1ff] text-[#0a0a12] rounded-md text-sm font-bold shrink-0 cursor-pointer border-none hover:bg-[#72ceff] transition-colors" onClick={() => addChapter(newChapterTitle)}>+</button>
                            </div>
                        </div>
                    </div>
                )}

                <div
                    className="flex-1 flex overflow-y-auto p-6"
                    style={{ justifyContent: ui.editorPosition === 'left' ? 'flex-start' : ui.editorPosition === 'right' ? 'flex-end' : 'center' }}
                >
                    <div className="relative" style={{ width: '100%', maxWidth: ui.editorWidth }}>
                        <div
                            ref={editorRef}
                            contentEditable
                            suppressContentEditableWarning
                            spellCheck
                            onInput={handleEditorInput}
                            onKeyDown={handleEditorKeyDown}
                            style={{
                                fontFamily: project.font,
                                fontSize: project.fontSize,
                                lineHeight: 1.9,
                                padding: '52px 60px',
                                background: `rgba(16,16,22,${ui.editorOpacity})`,
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: ui.editorRadius,
                                color: '#d0d0dc',
                                caretColor: '#4fc1ff',
                                outline: 'none',
                                minHeight: '60vh',
                                wordBreak: 'break-word',
                                overflowWrap: 'break-word',
                                boxShadow: '0 4px 60px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                            }}
                            className="[&_h1]:text-[2em] [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:mt-6 [&_h1]:mb-3 [&_h2]:text-[1.5em] [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:text-[1.2em] [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5 [&_p]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-[#4fc1ff]/50 [&_blockquote]:pl-4 [&_blockquote]:ml-0 [&_blockquote]:my-2 [&_blockquote]:text-[#8888a0] [&_blockquote]:italic"
                        />
                        {acSuggestions.length > 0 && (
                            <div
                                className="absolute z-50 min-w-[180px] rounded-lg overflow-hidden shadow-2xl border border-white/[0.1]"
                                style={{ top: acPos.top, left: acPos.left, background: 'rgba(20,20,28,0.98)', backdropFilter: 'blur(16px)' }}
                                onClick={e => e.stopPropagation()}
                            >
                                {acSuggestions.map((s, i) => (
                                    <div
                                        key={s}
                                        className="px-3 py-2 text-[13px] cursor-pointer transition-colors"
                                        style={{ background: i === acIndex ? 'rgba(79,193,255,0.15)' : undefined, color: i === acIndex ? '#4fc1ff' : '#c8c8d0' }}
                                        onMouseDown={e => { e.preventDefault(); completeAutocomplete(s); }}
                                    >
                                        {s}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {!focusMode && (
                <div className="relative z-10 flex items-center gap-2 h-[28px] min-h-[28px] px-4 shrink-0 border-t border-white/[0.06] text-[11px]" style={S.barBg}>
                    <span className="text-[#5a5a6a]">{wordCount} words</span>
                    <span className="text-[#2a2a3a]">·</span>
                    <span className="text-[#5a5a6a]">{charCount} chars</span>
                    <span className="text-[#2a2a3a]">·</span>
                    <span className="text-[#5a5a6a]">~{readingTime} min</span>
                    {project.dailyGoal > 0 && (
                        <>
                            <span className="text-[#2a2a3a]">·</span>
                            <span className="flex items-center gap-1.5 text-[#5a5a6a]">
                                {wordCount}/{project.dailyGoal}
                                <span className="inline-block w-14 h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
                                    <span className="block h-full bg-[#4fc1ff] rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.round(wordCount / project.dailyGoal * 100))}%` }} />
                                </span>
                            </span>
                        </>
                    )}
                    <span className="flex-1" />
                    <span className="text-[#3a3a5a]">{project.mode === 'screenplay' ? 'Script' : 'Prose'}</span>
                    <span className="text-[#2a2a3a]">·</span>
                    <span className="text-[#3a3a5a]">Ch {chapterIndex + 1}/{chapters.length}</span>
                </div>
            )}

            {focusMode && (
                <button
                    className="fixed top-5 right-5 z-[100] w-8 h-8 flex items-center justify-center rounded-full border border-white/[0.08] text-[#3a3a4a] text-xl cursor-pointer transition-all opacity-20 hover:opacity-100 hover:text-[#c8c8d0]"
                    style={{ background: 'rgba(14,14,20,0.7)', backdropFilter: 'blur(12px)' }}
                    onClick={() => setFocusMode(false)}
                    title="Exit Focus Mode (Esc)"
                >×</button>
            )}

            <input ref={fileInputRef} type="file" accept=".fountain" className="hidden" onChange={handleFountainImport} />

            {showSettings && (
                <div className={S.overlay} onClick={() => setShowSettings(false)}>
                    <div className={`${S.modal} max-w-[440px]`} style={S.modalBg} onClick={e => e.stopPropagation()}>
                        <div className={S.modalHead}>
                            <span className="text-[14px] font-semibold text-[#c8c8d0]">Settings</span>
                            <button className="text-[#4a4a5a] hover:text-[#c8c8d0] text-xl cursor-pointer bg-transparent border-none transition-colors leading-none" onClick={() => setShowSettings(false)}>×</button>
                        </div>
                        <div className={S.modalBody} style={{ maxHeight: 'calc(85vh - 56px)' }}>
                            <label className={S.label}>
                                Writing Mode
                                <select className={S.input} value={project.mode} onChange={e => updateProject('mode', e.target.value)} style={{ cursor: 'pointer' }}>
                                    <option value="prose" style={S.selOpt}>Prose (Novel / Story)</option>
                                    <option value="screenplay" style={S.selOpt}>Screenplay / Script</option>
                                </select>
                            </label>
                            <label className={S.label}>
                                Font
                                <select className={S.input} value={project.font} onChange={e => updateProject('font', e.target.value)} style={{ cursor: 'pointer' }}>
                                    {FONTS.map(f => <option key={f} value={f} style={S.selOpt}>{f}</option>)}
                                </select>
                            </label>
                            <label className={S.label}>
                                Font Size
                                <select className={S.input} value={project.fontSize} onChange={e => updateProject('fontSize', parseInt(e.target.value))} style={{ cursor: 'pointer' }}>
                                    {FONT_SIZES.map(s => <option key={s} value={s} style={S.selOpt}>{s}px</option>)}
                                </select>
                            </label>
                            <label className={S.label}>
                                Daily Word Goal
                                <input type="number" className={S.input} value={project.dailyGoal || ''} onChange={e => updateProject('dailyGoal', parseInt(e.target.value) || 0)} placeholder="0 (disabled)" min="0" />
                            </label>
                            <hr className={S.hr} />
                            <label className={S.label}>
                                Editor Position
                                <div className="flex gap-2">
                                    {(['left', 'center', 'right'] as const).map(pos => (
                                        <button
                                            key={pos}
                                            className="flex-1 py-2 rounded-lg border text-[12px] cursor-pointer transition-all"
                                            style={ui.editorPosition === pos ? { background: 'rgba(79,193,255,0.12)', borderColor: 'rgba(79,193,255,0.4)', color: '#4fc1ff' } : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: '#6a6a7a' }}
                                            onClick={() => updateUi('editorPosition', pos)}
                                        >
                                            {pos.charAt(0).toUpperCase() + pos.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </label>
                            <label className={S.label}>Editor Width — {ui.editorWidth}px<input type="range" min="320" max="1400" step="20" value={ui.editorWidth} onChange={e => updateUi('editorWidth', parseInt(e.target.value))} className={S.range} /></label>
                            <label className={S.label}>Editor Height — {ui.editorHeight}%<input type="range" min="20" max="100" step="5" value={ui.editorHeight} onChange={e => updateUi('editorHeight', parseInt(e.target.value))} className={S.range} /></label>
                            <label className={S.label}>Corner Radius — {ui.editorRadius}px<input type="range" min="0" max="40" step="2" value={ui.editorRadius} onChange={e => updateUi('editorRadius', parseInt(e.target.value))} className={S.range} /></label>
                            <label className={S.label}>Editor Opacity — {Math.round(ui.editorOpacity * 100)}%<input type="range" min="0.3" max="1" step="0.05" value={ui.editorOpacity} onChange={e => updateUi('editorOpacity', parseFloat(e.target.value))} className={S.range} /></label>
                            <hr className={S.hr} />
                            <label className={S.label}>Background Blur — {ui.bgBlur}px<input type="range" min="0" max="40" step="1" value={ui.bgBlur} onChange={e => updateUi('bgBlur', parseInt(e.target.value))} className={S.range} /></label>
                            <label className={S.label}>Background Dim — {ui.bgDim}%<input type="range" min="0" max="90" step="5" value={ui.bgDim} onChange={e => updateUi('bgDim', parseInt(e.target.value))} className={S.range} /></label>
                            <hr className={S.hr} />
                            <div className={S.label}>
                                Background Images
                                <div className="flex flex-col gap-2 mb-3">
                                    <input className={S.input} value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} placeholder="Image URL…" onKeyDown={e => e.key === 'Enter' && handleAddImage()} />
                                    <input className={S.input} value={newImageLabel} onChange={e => setNewImageLabel(e.target.value)} placeholder="Label (optional)" onKeyDown={e => e.key === 'Enter' && handleAddImage()} />
                                    <button className={S.accentBtn + ' self-start'} onClick={handleAddImage}>Add Image</button>
                                </div>
                                {images.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        {images.map(img => (
                                            <div
                                                key={img.id}
                                                className="group relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all"
                                                style={{ borderColor: ui.activeBgId === img.id ? '#4fc1ff' : 'transparent', outline: ui.activeBgId !== img.id ? '1px solid rgba(255,255,255,0.07)' : undefined }}
                                                onClick={() => updateUi('activeBgId', ui.activeBgId === img.id ? '' : img.id)}
                                            >
                                                <div className="w-full h-16 bg-cover bg-center" style={{ backgroundImage: `url(${img.url})`, backgroundColor: 'rgba(255,255,255,0.03)' }} />
                                                <div className="px-2 py-1 text-[11px] text-[#6a6a7a] truncate" style={{ background: 'rgba(14,14,20,0.8)' }}>{img.label || 'untitled'}</div>
                                                <button className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded-full border-none text-[#5a5a6a] text-xs cursor-pointer opacity-0 group-hover:opacity-100 hover:text-[#e06c75] transition-all" style={{ background: 'rgba(14,14,20,0.8)' }} onClick={e => { e.stopPropagation(); handleDeleteImage(img.id); }}>×</button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[12px] text-[#3a3a4a] py-2">No images added yet</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showBeatBoard && (
                <div className={S.overlay} onClick={() => setShowBeatBoard(false)}>
                    <div className={`${S.modal} max-w-[720px]`} style={S.modalBg} onClick={e => e.stopPropagation()}>
                        <div className={S.modalHead}>
                            <span className="text-[14px] font-semibold text-[#c8c8d0]">Beat Board — {project.name}</span>
                            <button className="text-[#4a4a5a] hover:text-[#c8c8d0] text-xl cursor-pointer bg-transparent border-none transition-colors leading-none" onClick={() => setShowBeatBoard(false)}>×</button>
                        </div>
                        <div className="p-5 grid grid-cols-3 gap-3 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 56px)' }}>
                            {chapters.map((ch, i) => {
                                const doc = new DOMParser().parseFromString(ch.content || '', 'text/html');
                                const preview = doc.body.innerText.slice(0, 130).trim();
                                const wc = countWords(doc.body.innerText);
                                return (
                                    <div
                                        key={ch.id}
                                        className="flex flex-col gap-2 p-3.5 rounded-xl border cursor-pointer transition-all"
                                        style={ch.id === ui.activeChapterId ? { borderColor: 'rgba(79,193,255,0.4)', background: 'rgba(79,193,255,0.07)' } : { borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
                                        onClick={() => { switchChapter(ch.id); setShowBeatBoard(false); }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#3a3a5a]">Ch {i + 1}</span>
                                            <span className="text-[10px] text-[#3a3a5a]">{wc}w</span>
                                        </div>
                                        <span className="text-[13px] font-semibold text-[#c8c8d0]">{ch.title}</span>
                                        {preview && <p className="text-[12px] text-[#6a6a7a] leading-relaxed" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{preview}</p>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {showSnapshots && (
                <div className={S.overlay} onClick={() => setShowSnapshots(false)}>
                    <div className={`${S.modal} max-w-[480px]`} style={S.modalBg} onClick={e => e.stopPropagation()}>
                        <div className={S.modalHead}>
                            <span className="text-[14px] font-semibold text-[#c8c8d0]">Snapshots</span>
                            <button className="text-[#4a4a5a] hover:text-[#c8c8d0] text-xl cursor-pointer bg-transparent border-none transition-colors leading-none" onClick={() => setShowSnapshots(false)}>×</button>
                        </div>
                        <div className={S.modalBody} style={{ maxHeight: 'calc(80vh - 56px)' }}>
                            <div className="flex gap-2">
                                <input className={`${S.input} flex-1`} value={snapshotLabel} onChange={e => setSnapshotLabel(e.target.value)} placeholder="Name this snapshot (e.g. First Draft)…" onKeyDown={e => e.key === 'Enter' && handleSaveSnapshot()} />
                                <button className={S.accentBtn} onClick={handleSaveSnapshot}>Save</button>
                            </div>
                            {snapshots.length === 0 && <p className="text-[13px] text-[#3a3a4a] text-center py-6">No snapshots yet.</p>}
                            <div className="flex flex-col gap-2">
                                {snapshots.map(snap => (
                                    <div key={snap.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.07] transition-colors" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-medium text-[#c8c8d0]">{snap.label}</div>
                                            <div className="text-[11px] text-[#3a3a4a] mt-0.5">{new Date(snap.createdAt).toLocaleString()}</div>
                                        </div>
                                        <button className={S.ghostBtn} onClick={() => handleRestoreSnapshot(snap)}>Restore</button>
                                        <button className="text-[#3a3a4a] hover:text-[#e06c75] text-xl cursor-pointer bg-transparent border-none transition-colors leading-none" onClick={() => handleDeleteSnapshot(snap.id)}>×</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showStats && (
                <div className={S.overlay} onClick={() => setShowStats(false)}>
                    <div className={`${S.modal} max-w-[440px]`} style={S.modalBg} onClick={e => e.stopPropagation()}>
                        <div className={S.modalHead}>
                            <span className="text-[14px] font-semibold text-[#c8c8d0]">Writing Stats</span>
                            <button className="text-[#4a4a5a] hover:text-[#c8c8d0] text-xl cursor-pointer bg-transparent border-none transition-colors leading-none" onClick={() => setShowStats(false)}>×</button>
                        </div>
                        <div className={S.modalBody} style={{ maxHeight: 'calc(80vh - 56px)' }}>
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { label: 'Total Words', value: totalProjectWords.toLocaleString() },
                                    { label: 'Chapters', value: String(chapters.length) },
                                    { label: 'Avg / Chapter', value: String(chapters.length ? Math.round(totalProjectWords / chapters.length) : 0) },
                                ].map(stat => (
                                    <div key={stat.label} className="flex flex-col gap-1 p-4 rounded-xl border border-white/[0.07]" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                        <span className="text-[10px] uppercase tracking-widest text-[#3a3a5a] font-semibold">{stat.label}</span>
                                        <span className="text-[22px] font-bold" style={{ color: '#4fc1ff' }}>{stat.value}</span>
                                    </div>
                                ))}
                            </div>
                            {sessions.length > 0 && (
                                <>
                                    <div className="text-[11px] font-semibold uppercase tracking-widest text-[#3a3a5a]">Recent Sessions</div>
                                    <div className="flex flex-col gap-1.5">
                                        {sessions.slice(0, 10).map(s => (
                                            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                                <span className="text-[12px] text-[#5a5a6a] flex-1">{s.date}</span>
                                                <span className="text-[13px] font-semibold text-[#c8c8d0]">+{s.wordsWritten}w</span>
                                                <span className="text-[11px] text-[#3a3a5a]">{Math.round(s.durationSeconds / 60)}min</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                            {sessions.length === 0 && <p className="text-[13px] text-[#3a3a4a] text-center py-4">No sessions recorded yet.</p>}
                        </div>
                    </div>
                </div>
            )}

            {showWordScanner && (
                <div className={S.overlay} onClick={() => setShowWordScanner(false)}>
                    <div className={`${S.modal} max-w-[440px]`} style={S.modalBg} onClick={e => e.stopPropagation()}>
                        <div className={S.modalHead}>
                            <span className="text-[14px] font-semibold text-[#c8c8d0]">Word Scanner</span>
                            <button className="text-[#4a4a5a] hover:text-[#c8c8d0] text-xl cursor-pointer bg-transparent border-none transition-colors leading-none" onClick={() => setShowWordScanner(false)}>×</button>
                        </div>
                        <div className={S.modalBody} style={{ maxHeight: 'calc(80vh - 56px)' }}>
                            <p className="text-[12px] text-[#4a4a5a]">Most repeated words (common words excluded)</p>
                            {wordFreq.length === 0 && <p className="text-[13px] text-[#3a3a4a] text-center py-6">No content to scan.</p>}
                            <div className="flex flex-col gap-2">
                                {wordFreq.map(([word, count]) => {
                                    const max = wordFreq[0]?.[1] ?? 1;
                                    return (
                                        <div key={word} className="flex items-center gap-3">
                                            <span className="w-28 text-[13px] text-[#a0a0b0] font-mono shrink-0">{word}</span>
                                            <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(count / max) * 100}%`, background: '#4fc1ff' }} />
                                            </div>
                                            <span className="text-[11px] text-[#3a3a5a] w-6 text-right shrink-0">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showTitlePage && (
                <div className={S.overlay} onClick={() => setShowTitlePage(false)}>
                    <div className={`${S.modal} max-w-[440px]`} style={S.modalBg} onClick={e => e.stopPropagation()}>
                        <div className={S.modalHead}>
                            <span className="text-[14px] font-semibold text-[#c8c8d0]">Title Page</span>
                            <button className="text-[#4a4a5a] hover:text-[#c8c8d0] text-xl cursor-pointer bg-transparent border-none transition-colors leading-none" onClick={() => setShowTitlePage(false)}>×</button>
                        </div>
                        <div className={S.modalBody} style={{ maxHeight: 'calc(80vh - 56px)' }}>
                            <p className="text-[12px] text-[#4a4a5a]">Appears on the title page when exporting to PDF.</p>
                            {(['title', 'author', 'contact', 'draftDate', 'copyright'] as (keyof TitlePageData)[]).map(field => (
                                <label key={field} className={S.label}>
                                    {field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                                    <input className={S.input} value={titlePage[field]} onChange={e => setTitlePage(prev => ({ ...prev, [field]: e.target.value }))} placeholder={field} />
                                </label>
                            ))}
                            <button className={`${S.accentBtn} self-end mt-2`} onClick={() => { handleExport('pdf'); setShowTitlePage(false); }}>Export PDF</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
