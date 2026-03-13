'use server';

import { getSetting, setSetting } from '@/lib/dal/settings';

export async function getSettingAction(key: string): Promise<string | null> {
    return getSetting(key);
}

export async function setSettingAction(key: string, value: string): Promise<void> {
    setSetting(key, value);
}
