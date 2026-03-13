import db from '../db';

export interface WriterSession {
    id: string;
    projectId: string;
    date: string;
    wordsWritten: number;
    durationSeconds: number;
}

export function getSessions(projectId: string, limit = 30): WriterSession[] {
    return db.prepare(
        'SELECT id, project_id as projectId, date, words_written as wordsWritten, duration_seconds as durationSeconds FROM writer_sessions WHERE project_id = ? ORDER BY date DESC LIMIT ?'
    ).all(projectId, limit) as WriterSession[];
}

export function saveSession(s: WriterSession): void {
    db.prepare(
        'INSERT INTO writer_sessions (id, project_id, date, words_written, duration_seconds) VALUES (?, ?, ?, ?, ?)'
    ).run(s.id, s.projectId, s.date, s.wordsWritten, s.durationSeconds);
}
