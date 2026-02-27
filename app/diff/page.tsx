import type { Metadata } from 'next';
import DiffChecker from '@/components/DiffChecker';

export const metadata: Metadata = {
    title: 'dev-toolkit — Diff Checker',
    description: 'Compare two blocks of text side by side and highlight the differences.',
};

export default function DiffPage() {
    return <DiffChecker />;
}
