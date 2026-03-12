import type { Metadata } from 'next';
import FocusWriter from '@/components/FocusWriter';

export const metadata: Metadata = {
    title: 'dev-toolkit — Focus Writer',
    description: 'Distraction-free writing environment with customizable backgrounds and glassmorphism editor.',
};

export default function FocusWriterPage() {
    return <FocusWriter />;
}
