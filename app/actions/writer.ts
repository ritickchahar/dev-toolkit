'use server';

import {
    getProjects, upsertProject, deleteProject,
    getChapters, upsertChapter, deleteChapter,
    getWriterUi, setWriterUiField,
    type WriterProject, type WriterChapter, type WriterUi,
} from '@/lib/dal/writer';
import { getImages, addImage, deleteImage, type BgImage } from '@/lib/dal/images';

export async function loadWriterAction() {
    const projects = getProjects();
    const ui = getWriterUi();
    const images = getImages();

    const activeProjectId = projects.find(p => p.id === ui.activeProjectId)?.id ?? projects[0]?.id ?? '';
    const chapters = activeProjectId ? getChapters(activeProjectId) : [];
    const activeChapterId = chapters.find(c => c.id === ui.activeChapterId)?.id ?? chapters[0]?.id ?? '';

    return { projects, ui: { ...ui, activeProjectId, activeChapterId }, images, chapters };
}

export async function getChaptersAction(projectId: string): Promise<WriterChapter[]> {
    return getChapters(projectId);
}

export async function upsertProjectAction(project: WriterProject): Promise<void> {
    upsertProject(project);
}

export async function deleteProjectAction(id: string): Promise<void> {
    deleteProject(id);
}

export async function upsertChapterAction(chapter: WriterChapter): Promise<void> {
    upsertChapter(chapter);
}

export async function deleteChapterAction(id: string): Promise<void> {
    deleteChapter(id);
}

export async function setWriterUiAction(key: keyof WriterUi, value: string): Promise<void> {
    setWriterUiField(key, value);
}

export async function addWriterImageAction(image: BgImage): Promise<void> {
    addImage(image);
}

export async function deleteWriterImageAction(id: string): Promise<void> {
    deleteImage(id);
}
