import db from '../db';

export interface Note {
    id: string;
    title: string;
    body: string;
    createdAt: string;
}

export function getNotes(): Note[] {
    return db.prepare(
        'SELECT id, title, body, created_at as createdAt FROM notes ORDER BY created_at DESC'
    ).all() as Note[];
}

export function createNote(note: Note): void {
    db.prepare(
        'INSERT INTO notes (id, title, body, created_at) VALUES (?, ?, ?, ?)'
    ).run(note.id, note.title, note.body, note.createdAt);
}

export function deleteNote(id: string): void {
    db.prepare('DELETE FROM notes WHERE id = ?').run(id);
}
