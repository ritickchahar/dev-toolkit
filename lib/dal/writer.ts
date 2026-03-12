import db from '../db';

export interface WriterProject {
    id: string;
    name: string;
    mode: 'prose' | 'screenplay';
    font: string;
    fontSize: number;
    dailyGoal: number;
    createdAt: string;
    updatedAt: string;
}

export interface WriterChapter {
    id: string;
    projectId: string;
    title: string;
    content: string;
    ord: number;
}

export interface WriterUi {
    editorOpacity: number;
    editorPosition: 'left' | 'center' | 'right';
    editorWidth: number;
    editorHeight: number;
    editorRadius: number;
    bgBlur: number;
    bgDim: number;
    activeBgId: string;
    activeProjectId: string;
    activeChapterId: string;
}

const UI_DEFAULTS: WriterUi = {
    editorOpacity: 0.82,
    editorPosition: 'center',
    editorWidth: 780,
    editorHeight: 100,
    editorRadius: 12,
    bgBlur: 0,
    bgDim: 35,
    activeBgId: '',
    activeProjectId: '',
    activeChapterId: '',
};

function getUiValue(key: string): string | null {
    const row = db.prepare('SELECT value FROM writer_ui WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
}

export function setWriterUiField(key: keyof WriterUi, value: string): void {
    db.prepare(
        'INSERT INTO writer_ui (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, value);
}

export function getWriterUi(): WriterUi {
    return {
        editorOpacity: parseFloat(getUiValue('editorOpacity') ?? String(UI_DEFAULTS.editorOpacity)),
        editorPosition: (getUiValue('editorPosition') ?? UI_DEFAULTS.editorPosition) as WriterUi['editorPosition'],
        editorWidth: parseInt(getUiValue('editorWidth') ?? String(UI_DEFAULTS.editorWidth)),
        editorHeight: parseInt(getUiValue('editorHeight') ?? String(UI_DEFAULTS.editorHeight)),
        editorRadius: parseInt(getUiValue('editorRadius') ?? String(UI_DEFAULTS.editorRadius)),
        bgBlur: parseInt(getUiValue('bgBlur') ?? String(UI_DEFAULTS.bgBlur)),
        bgDim: parseInt(getUiValue('bgDim') ?? String(UI_DEFAULTS.bgDim)),
        activeBgId: getUiValue('activeBgId') ?? '',
        activeProjectId: getUiValue('activeProjectId') ?? '',
        activeChapterId: getUiValue('activeChapterId') ?? '',
    };
}

export function getProjects(): WriterProject[] {
    return db.prepare(
        'SELECT id, name, mode, font, font_size as fontSize, daily_goal as dailyGoal, created_at as createdAt, updated_at as updatedAt FROM writer_projects ORDER BY created_at ASC'
    ).all() as WriterProject[];
}

export function upsertProject(p: WriterProject): void {
    db.prepare(`
        INSERT INTO writer_projects (id, name, mode, font, font_size, daily_goal, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, mode = excluded.mode, font = excluded.font,
            font_size = excluded.font_size, daily_goal = excluded.daily_goal, updated_at = excluded.updated_at
    `).run(p.id, p.name, p.mode, p.font, p.fontSize, p.dailyGoal, p.createdAt, p.updatedAt);
}

export function deleteProject(id: string): void {
    db.prepare('DELETE FROM writer_projects WHERE id = ?').run(id);
}

export function getChapters(projectId: string): WriterChapter[] {
    return db.prepare(
        'SELECT id, project_id as projectId, title, content, ord FROM writer_chapters WHERE project_id = ? ORDER BY ord ASC'
    ).all(projectId) as WriterChapter[];
}

export function upsertChapter(c: WriterChapter): void {
    db.prepare(`
        INSERT INTO writer_chapters (id, project_id, title, content, ord)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, ord = excluded.ord
    `).run(c.id, c.projectId, c.title, c.content, c.ord);
}

export function deleteChapter(id: string): void {
    db.prepare('DELETE FROM writer_chapters WHERE id = ?').run(id);
}
