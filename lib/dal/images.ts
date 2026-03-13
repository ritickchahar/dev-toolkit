import db from '../db';

export interface BgImage {
    id: string;
    url: string;
    label: string;
    addedAt: string;
}

export function getImages(): BgImage[] {
    return db.prepare(
        'SELECT id, url, label, added_at as addedAt FROM background_images ORDER BY added_at DESC'
    ).all() as BgImage[];
}

export function addImage(image: BgImage): void {
    db.prepare(
        'INSERT INTO background_images (id, url, label, added_at) VALUES (?, ?, ?, ?)'
    ).run(image.id, image.url, image.label, image.addedAt);
}

export function deleteImage(id: string): void {
    db.prepare('DELETE FROM background_images WHERE id = ?').run(id);
}
