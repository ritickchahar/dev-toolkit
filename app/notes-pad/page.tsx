import type { Metadata } from 'next';
import NotesPad from '@/components/NotesPad';

export const metadata: Metadata = {
    title: 'dev-toolkit — Notes Pad',
    description: 'A simple personal notepad — create, view, and delete notes stored in your browser.',
};

export default function NotesPadPage() {
    return <NotesPad />;
}
