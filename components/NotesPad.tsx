'use client';

import { useState, useEffect, useCallback } from 'react';
import ThemeSelector from './ThemeSelector';
import styles from './NotesPad.module.css';

const STORAGE_KEY = 'dev-toolkit-notes-pad';
const PER_PAGE = 6;

interface Note {
    id: string;
    title: string;
    body: string;
    createdAt: string;
}

function loadNotes(): { notes: Note[]; ok: boolean } {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return { notes: raw ? (JSON.parse(raw) as Note[]) : [], ok: true };
    } catch {
        return { notes: [], ok: false };
    }
}

function saveNotes(notes: Note[]): boolean {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); return true; }
    catch { return false; }
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function NotesPad() {
    const [notes, setNotes] = useState<Note[]>([]);
    const [storageOk, setStorageOk] = useState(true);
    const [page, setPage] = useState(0);

    // Create form
    const [showForm, setShowForm] = useState(false);
    const [formTitle, setFormTitle] = useState('');
    const [formBody, setFormBody] = useState('');
    const [formError, setFormError] = useState('');

    // View modal
    const [viewing, setViewing] = useState<Note | null>(null);

    useEffect(() => {
        const { notes: loaded, ok } = loadNotes();
        setNotes(loaded);
        setStorageOk(ok);
    }, []);

    const persist = useCallback((next: Note[]) => {
        setNotes(next);
        if (!saveNotes(next)) setStorageOk(false);
    }, []);

    function handleSave() {
        const title = formTitle.trim();
        if (!title) { setFormError('Title is required.'); return; }
        const note: Note = { id: genId(), title, body: formBody, createdAt: new Date().toISOString() };
        persist([note, ...notes]);
        setFormTitle(''); setFormBody(''); setFormError(''); setShowForm(false);
        setPage(0);
    }

    function handleDelete(id: string) {
        const next = notes.filter(n => n.id !== id);
        persist(next);
        const maxPage = Math.max(0, Math.ceil(next.length / PER_PAGE) - 1);
        if (page > maxPage) setPage(maxPage);
    }

    function handleCancel() {
        setFormTitle(''); setFormBody(''); setFormError(''); setShowForm(false);
    }

    const totalPages = Math.max(1, Math.ceil(notes.length / PER_PAGE));
    const pageNotes = notes.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

    return (
        <div className={styles.wrapper}>
            {/* Toolbar */}
            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>Notes Pad</span>
                <div className={styles.toolbarActions}>
                    <button className={styles.newBtn} onClick={() => setShowForm(true)} disabled={showForm}>
                        + New Note
                    </button>
                    <ThemeSelector />
                </div>
            </div>

            {!storageOk && (
                <div className={styles.warning}>Storage unavailable. Notes will not persist after closing the tab.</div>
            )}

            <div className={styles.content}>
                {/* Create form */}
                {showForm && (
                    <div className={styles.formPanel}>
                        <input
                            className={styles.formTitle}
                            value={formTitle}
                            onChange={e => { setFormTitle(e.target.value); setFormError(''); }}
                            placeholder="Note title"
                            spellCheck={false}
                            autoCorrect="off"
                            autoFocus
                        />
                        {formError && <span className={styles.formError}>{formError}</span>}
                        <textarea
                            className={styles.formBody}
                            value={formBody}
                            onChange={e => setFormBody(e.target.value)}
                            placeholder="Body (optional)"
                            spellCheck={false}
                            autoCorrect="off"
                            rows={5}
                        />
                        <div className={styles.formActions}>
                            <button className={styles.saveBtn} onClick={handleSave}>Save Note</button>
                            <button className={styles.cancelBtn} onClick={handleCancel}>Cancel</button>
                        </div>
                    </div>
                )}

                {/* Notes grid */}
                {notes.length === 0 && !showForm ? (
                    <p className={styles.empty}>No notes yet. Click New Note to create one.</p>
                ) : (
                    <div className={styles.grid}>
                        {pageNotes.map(note => (
                            <div key={note.id} className={styles.card} onClick={() => setViewing(note)}>
                                <button
                                    className={styles.deleteBtn}
                                    onClick={e => { e.stopPropagation(); handleDelete(note.id); }}
                                    title="Delete note"
                                >×</button>
                                <h3 className={styles.cardTitle}>{note.title}</h3>
                                <p className={styles.cardBody}>{note.body || '\u00A0'}</p>
                                <span className={styles.cardDate}>{fmtDate(note.createdAt)}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className={styles.pagination}>
                        <button
                            className={styles.pageBtn}
                            onClick={() => setPage(p => p - 1)}
                            disabled={page === 0}
                        >← Previous</button>
                        <span className={styles.pageInfo}>Page {page + 1} of {totalPages}</span>
                        <button
                            className={styles.pageBtn}
                            onClick={() => setPage(p => p + 1)}
                            disabled={page >= totalPages - 1}
                        >Next →</button>
                    </div>
                )}
            </div>

            {/* View modal */}
            {viewing && (
                <div className={styles.overlay} onClick={() => setViewing(null)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <button className={styles.modalClose} onClick={() => setViewing(null)}>×</button>
                        <h2 className={styles.modalTitle}>{viewing.title}</h2>
                        <span className={styles.modalDate}>{fmtDate(viewing.createdAt)}</span>
                        <pre className={styles.modalBody}>{viewing.body || '(empty)'}</pre>
                    </div>
                </div>
            )}

            {/* Status bar */}
            <div className={styles.statusBar}>
                <span className={styles.statusItem}>
                    {notes.length} note{notes.length !== 1 ? 's' : ''}
                    {totalPages > 1 ? ` · Page ${page + 1} of ${totalPages}` : ''}
                </span>
            </div>
        </div>
    );
}
