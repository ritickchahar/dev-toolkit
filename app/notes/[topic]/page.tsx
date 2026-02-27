'use client';

import { useParams } from 'next/navigation';
import NoteViewer from '@/components/NoteViewer';

export default function NotePage() {
    const params = useParams();
    return <NoteViewer topic={params.topic as string} />;
}
