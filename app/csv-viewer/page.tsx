import type { Metadata } from 'next';
import CsvViewer from '@/components/CsvViewer';

export const metadata: Metadata = {
    title: 'dev-toolkit — CSV Viewer',
    description: 'Parse, sort, search, and export CSV data instantly in the browser.',
};

export default function CsvViewerPage() {
    return <CsvViewer />;
}
