import type { Metadata } from 'next';
import ColorPicker from '@/components/ColorPicker';

export const metadata: Metadata = {
    title: 'dev-toolkit — Color Picker',
    description: 'Pick a color and convert it between HEX, RGB, HSL, and HSB formats.',
};

export default function ColorPickerPage() {
    return <ColorPicker />;
}
