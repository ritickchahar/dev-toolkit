import type { Metadata } from 'next';
import Titlebar from '@/components/Titlebar';
import ClipboardEditor from '@/components/ClipboardEditor';

export const metadata: Metadata = {
    title: 'dev-toolkit — Clipboard',
    description: 'Paste and inspect text or code with line numbers and character counts.',
};

export default function ClipboardPage() {
    return (
        <>
            <Titlebar title="Clipboard" />
            <ClipboardEditor />
        </>
    );
}
