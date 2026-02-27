import type { Metadata } from 'next';
import JwtDecoder from '@/components/JwtDecoder';

export const metadata: Metadata = {
    title: 'dev-toolkit — JWT Decoder',
    description: 'Decode and inspect JWT tokens instantly in the browser.',
};

export default function JwtDecoderPage() {
    return <JwtDecoder />;
}
