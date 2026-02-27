import type { Metadata } from 'next';
import MarkdownPreview from '@/components/MarkdownPreview';

export const metadata: Metadata = {
    title: 'dev-toolkit — Markdown Preview',
    description: 'Live two-pane markdown editor with GitHub-flavored rendering.',
};

export default function MarkdownPreviewPage() {
    return <MarkdownPreview />;
}
