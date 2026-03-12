'use server';

import { getImages, addImage, deleteImage, type BgImage } from '@/lib/dal/images';

export async function getImagesAction(): Promise<BgImage[]> {
    return getImages();
}

export async function addImageAction(image: BgImage): Promise<void> {
    addImage(image);
}

export async function deleteImageAction(id: string): Promise<void> {
    deleteImage(id);
}
