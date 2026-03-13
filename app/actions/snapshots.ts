'use server';

import { getSnapshots, saveSnapshot, deleteSnapshot, type WriterSnapshot } from '@/lib/dal/snapshots';

export async function getSnapshotsAction(projectId: string): Promise<WriterSnapshot[]> {
    return getSnapshots(projectId);
}

export async function saveSnapshotAction(snapshot: WriterSnapshot): Promise<void> {
    saveSnapshot(snapshot);
}

export async function deleteSnapshotAction(id: string): Promise<void> {
    deleteSnapshot(id);
}
