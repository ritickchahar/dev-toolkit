import db from '../db';

export interface WriterSnapshot {
    id: string;
    projectId: string;
    label: string;
    contentJson: string;
    createdAt: string;
}

export function getSnapshots(projectId: string): WriterSnapshot[] {
    return db.prepare(
        'SELECT id, project_id as projectId, label, content_json as contentJson, created_at as createdAt FROM writer_snapshots WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId) as WriterSnapshot[];
}

export function saveSnapshot(s: WriterSnapshot): void {
    db.prepare(
        'INSERT INTO writer_snapshots (id, project_id, label, content_json, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(s.id, s.projectId, s.label, s.contentJson, s.createdAt);
}

export function deleteSnapshot(id: string): void {
    db.prepare('DELETE FROM writer_snapshots WHERE id = ?').run(id);
}
