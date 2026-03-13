'use server';

import { getNotes, createNote, deleteNote, type Note } from '@/lib/dal/notes';

export async function getNotesAction(): Promise<Note[]> {
    return getNotes();
}

export async function createNoteAction(note: Note): Promise<void> {
    createNote(note);
}

export async function deleteNoteAction(id: string): Promise<void> {
    deleteNote(id);
}
