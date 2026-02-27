import type { Metadata } from 'next';
import JsonFormatter from '@/components/JsonFormatter';

export const metadata: Metadata = {
    title: 'dev-toolkit — JSON Formatter',
    description: 'Format, validate, and minify JSON with real-time feedback.',
};

export default function JsonFormatterPage() {
    return <JsonFormatter />;
}
