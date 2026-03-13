'use server';

import { getSessions, saveSession, type WriterSession } from '@/lib/dal/sessions';

export async function getSessionsAction(projectId: string): Promise<WriterSession[]> {
    return getSessions(projectId);
}

export async function saveSessionAction(session: WriterSession): Promise<void> {
    saveSession(session);
}
