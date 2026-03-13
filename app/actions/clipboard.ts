'use server';

import { getClipboard, upsertTab, saveTabContent, deleteTab, setActiveTab, type ClipTab } from '@/lib/dal/clipboard';

export async function loadClipboardAction(): Promise<{ tabs: ClipTab[]; activeId: string }> {
    return getClipboard();
}

export async function upsertTabAction(tab: ClipTab): Promise<void> {
    upsertTab(tab);
}

export async function saveTabContentAction(tabId: string, content: string): Promise<void> {
    saveTabContent(tabId, content);
}

export async function deleteTabAction(id: string): Promise<void> {
    deleteTab(id);
}

export async function setActiveTabAction(id: string): Promise<void> {
    setActiveTab(id);
}
