import db from '../db';

export interface ClipTab {
    id: string;
    title: string;
    ord: number;
    createdAt: string;
    content: string;
}

export function getClipboard(): { tabs: ClipTab[]; activeId: string } {
    const tabs = db.prepare(`
        SELECT t.id, t.title, t.ord, t.created_at as createdAt, COALESCE(c.content, '') as content
        FROM clipboard_tabs t
        LEFT JOIN clipboard_content c ON c.tab_id = t.id
        ORDER BY t.ord ASC
    `).all() as ClipTab[];

    const row = db.prepare("SELECT value FROM settings WHERE key = 'clipboard_active_id'").get() as { value: string } | undefined;
    const activeId = row?.value ?? tabs[0]?.id ?? '';
    return { tabs, activeId };
}

export function upsertTab(tab: ClipTab): void {
    db.prepare(`
        INSERT INTO clipboard_tabs (id, title, ord, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, ord = excluded.ord
    `).run(tab.id, tab.title, tab.ord, tab.createdAt);
    db.prepare(`
        INSERT INTO clipboard_content (tab_id, content) VALUES (?, ?)
        ON CONFLICT(tab_id) DO UPDATE SET content = excluded.content
    `).run(tab.id, tab.content);
}

export function saveTabContent(tabId: string, content: string): void {
    db.prepare(`
        INSERT INTO clipboard_content (tab_id, content) VALUES (?, ?)
        ON CONFLICT(tab_id) DO UPDATE SET content = excluded.content
    `).run(tabId, content);
}

export function deleteTab(id: string): void {
    db.prepare('DELETE FROM clipboard_tabs WHERE id = ?').run(id);
}

export function setActiveTab(id: string): void {
    db.prepare(
        "INSERT INTO settings (key, value) VALUES ('clipboard_active_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(id);
}
