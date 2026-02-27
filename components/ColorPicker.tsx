'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import styles from './ColorPicker.module.css';

const DEFAULT_COLOR = '#3b82f6';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return null;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (delta !== 0) {
        s = delta / (1 - Math.abs(2 * l - 1));
        if (max === rn) h = ((gn - bn) / delta + 6) % 6;
        else if (max === gn) h = (bn - rn) / delta + 2;
        else h = (rn - gn) / delta + 4;
        h = Math.round(h * 60);
    }
    return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

function rgbToHsb(r: number, g: number, b: number): { h: number; s: number; b: number } {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    const s = max === 0 ? 0 : delta / max;
    if (delta !== 0) {
        if (max === rn) h = ((gn - bn) / delta + 6) % 6;
        else if (max === gn) h = (bn - rn) / delta + 2;
        else h = (rn - gn) / delta + 4;
        h = Math.round(h * 60);
    }
    return { h, s: Math.round(s * 100), b: Math.round(max * 100) };
}

function isLight(r: number, g: number, b: number): boolean {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

export default function ColorPicker() {
    const { theme, toggleTheme } = useTheme();
    const [color, setColor] = useState(DEFAULT_COLOR);
    const [hexInput, setHexInput] = useState(DEFAULT_COLOR);
    const [isDragging, setIsDragging] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [copiedAll, setCopiedAll] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        function handlePaste(e: ClipboardEvent) {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) sampleImageColor(file);
                    break;
                }
            }
        }
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);


    const rgb = hexToRgb(color) ?? { r: 59, g: 130, b: 246 };
    const { h: hslH, s: hslS, l: hslL } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const { h: hsbH, s: hsbS, b: hsbB } = rgbToHsb(rgb.r, rgb.g, rgb.b);

    const outputs = [
        { key: 'hex', label: 'HEX', value: color },
        { key: 'rgb', label: 'RGB', value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
        { key: 'hsl', label: 'HSL', value: `hsl(${hslH}, ${hslS}%, ${hslL}%)` },
        { key: 'hsb', label: 'HSB', value: `hsb(${hsbH}, ${hsbS}%, ${hsbB}%)` },
    ];

    function applyColor(hex: string) {
        setColor(hex);
        setHexInput(hex);
    }

    function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
        applyColor(e.target.value);
    }

    function handleHexChange(e: React.ChangeEvent<HTMLInputElement>) {
        setHexInput(e.target.value);
    }

    function commitHexInput(raw: string) {
        const val = raw.startsWith('#') ? raw : '#' + raw;
        const parsed = hexToRgb(val);
        if (parsed) applyColor(val);
        else setHexInput(color);
    }

    function handleHexKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') commitHexInput(hexInput);
    }

    function sampleImageColor(file: File) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0);
            const grid = 10;
            let totalR = 0, totalG = 0, totalB = 0, count = 0;
            for (let i = 0; i < grid; i++) {
                for (let j = 0; j < grid; j++) {
                    const x = Math.floor((i / grid) * img.width);
                    const y = Math.floor((j / grid) * img.height);
                    const px = ctx.getImageData(x, y, 1, 1).data;
                    totalR += px[0]; totalG += px[1]; totalB += px[2];
                    count++;
                }
            }
            applyColor(rgbToHex(Math.round(totalR / count), Math.round(totalG / count), Math.round(totalB / count)));
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) sampleImageColor(file);
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
            sampleImageColor(file);
        }
    }

    async function copyValue(key: string, value: string) {
        await navigator.clipboard.writeText(value);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 1500);
    }

    async function handleCopyAll() {
        await navigator.clipboard.writeText(outputs.map((o) => o.value).join('\n'));
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 1500);
    }

    function handleReset() {
        applyColor(DEFAULT_COLOR);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    const lightBg = isLight(rgb.r, rgb.g, rgb.b);

    return (
        <div className={styles.wrapper}>
            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>Color Picker</span>
                <div className={styles.toolbarActions}>
                    <button
                        id="color-theme-toggle"
                        className={styles.themeToggle}
                        onClick={toggleTheme}
                        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                    >
                        {theme === 'dark' ? '○' : '●'}
                        <span className={styles.themeLabel}>{theme === 'dark' ? 'Light' : 'Dark'}</span>
                    </button>
                </div>
            </div>

            <div className={styles.content}>
                <div className={styles.inner}>
                    <div className={styles.preview} style={{ backgroundColor: color }}>
                        <span
                            className={styles.previewText}
                            style={{ color: lightBg ? '#000000' : '#ffffff' }}
                        >
                            {color}
                        </span>
                    </div>

                    <div className={styles.inputSection}>
                        <input
                            id="color-native"
                            type="color"
                            className={styles.colorInput}
                            value={color}
                            onChange={handleNativeChange}
                            title="Open color picker"
                        />
                        <input
                            id="color-hex-input"
                            type="text"
                            className={styles.hexInput}
                            value={hexInput}
                            onChange={handleHexChange}
                            onKeyDown={handleHexKeyDown}
                            onBlur={() => commitHexInput(hexInput)}
                            placeholder="#000000"
                            spellCheck={false}
                            maxLength={7}
                        />
                    </div>

                    <div
                        id="color-dropzone"
                        className={`${styles.dropZone} ${isDragging ? styles.dropZoneDragging : ''}`}
                        onClick={() => fileInputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                    >
                        <span className={styles.dropZoneIcon}>↑</span>
                        <span className={styles.dropZoneText}>
                            Drop a single-color image here or click to upload
                        </span>
                        <span className={styles.dropZoneHint}>JPG or PNG</span>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />
                    <canvas ref={canvasRef} style={{ display: 'none' }} />

                    <div className={styles.outputs}>
                        {outputs.map(({ key, label, value }) => (
                            <div key={key} className={styles.outputRow}>
                                <span className={styles.outputLabel}>{label}</span>
                                <span className={styles.outputValue}>{value}</span>
                                <button
                                    id={`color-copy-${key}`}
                                    className={styles.copyBtn}
                                    onClick={() => copyValue(key, value)}
                                    title={`Copy ${label}`}
                                >
                                    {copiedKey === key ? '✓' : '⧉'}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className={styles.footer}>
                        <button id="color-copy-all" className={styles.actionBtn} onClick={handleCopyAll}>
                            {copiedAll ? '✓ Copied!' : '⧉ Copy All'}
                        </button>
                        <button
                            id="color-reset"
                            className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                            onClick={handleReset}
                        >
                            ↺ Reset
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
