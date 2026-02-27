import type { Metadata } from 'next';
import NoteViewer from '@/components/NoteViewer';

type Props = { params: Promise<{ topic: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { topic } = await params;
    const display = topic.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return { title: `dev-toolkit — ${display}` };
}

export default async function NotePage({ params }: Props) {
    const { topic } = await params;
    return <NoteViewer topic={topic} />;
}
