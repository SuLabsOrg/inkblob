import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../../hooks/useClickOutside';

export interface ColorSwatch {
    label: string;
    /** CSS color value applied to the selection - `var(--x)` values track the active theme
     *  (light/dark) automatically since index.css defines those custom properties per-theme. */
    value: string;
    swatch: string;
}

export const TEXT_COLORS: ColorSwatch[] = [
    { label: 'Default', value: 'inherit', swatch: 'transparent' },
    { label: 'Purple', value: 'var(--primary)', swatch: 'var(--primary)' },
    { label: 'Pink', value: 'var(--secondary)', swatch: 'var(--secondary)' },
    { label: 'Cyan', value: 'var(--accent)', swatch: 'var(--accent)' },
    { label: 'Red', value: '#f87171', swatch: '#f87171' },
    { label: 'Orange', value: '#fb923c', swatch: '#fb923c' },
    { label: 'Green', value: '#4ade80', swatch: '#4ade80' },
    { label: 'Gray', value: 'var(--text-muted)', swatch: 'var(--text-muted)' },
];

// Fixed rgba (not color-mix(), for broader browser compatibility) - approximates each theme
// color at 25% opacity so highlights stay legible against both light and dark backgrounds.
export const HIGHLIGHT_COLORS: ColorSwatch[] = [
    { label: 'None', value: 'transparent', swatch: 'transparent' },
    { label: 'Purple', value: 'rgba(139, 92, 246, 0.25)', swatch: 'var(--primary)' },
    { label: 'Pink', value: 'rgba(236, 72, 153, 0.25)', swatch: 'var(--secondary)' },
    { label: 'Cyan', value: 'rgba(6, 182, 212, 0.25)', swatch: 'var(--accent)' },
    { label: 'Red', value: 'rgba(248, 113, 113, 0.25)', swatch: '#f87171' },
    { label: 'Orange', value: 'rgba(251, 146, 60, 0.25)', swatch: '#fb923c' },
    { label: 'Green', value: 'rgba(74, 222, 128, 0.25)', swatch: '#4ade80' },
    { label: 'Gray', value: 'rgba(160, 160, 160, 0.25)', swatch: 'var(--text-muted)' },
];

interface ColorPickerPopoverProps {
    position: { top: number; left: number };
    onSelectTextColor: (value: string) => void;
    onSelectHighlight: (value: string) => void;
    onClose: () => void;
}

export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({ position, onSelectTextColor, onSelectHighlight, onClose }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    useClickOutside(containerRef, onClose);

    const renderRow = (label: string, colors: ColorSwatch[], onSelect: (value: string) => void) => (
        <div>
            <div className="text-[10px] font-semibold text-web3-textMuted uppercase tracking-wider px-1 mb-1">{label}</div>
            <div className="flex items-center gap-1">
                {colors.map((c) => (
                    <button
                        key={c.label}
                        title={c.label}
                        aria-label={`${label}: ${c.label}`}
                        onClick={() => { onSelect(c.value); onClose(); }}
                        className="w-6 h-6 rounded-full border border-web3-border flex items-center justify-center hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.swatch === 'transparent' ? 'transparent' : c.swatch, opacity: c.swatch === 'transparent' ? 1 : 0.85 }}
                    >
                        {c.swatch === 'transparent' && <span className="text-[10px] text-web3-textMuted">✕</span>}
                    </button>
                ))}
            </div>
        </div>
    );

    return createPortal(
        <div
            ref={containerRef}
            className="fixed z-50 w-64 rounded-lg border border-web3-border bg-web3-card shadow-xl p-3 space-y-3 animate-in fade-in zoom-in-95 duration-100"
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()}
        >
            {renderRow('Text color', TEXT_COLORS, onSelectTextColor)}
            {renderRow('Highlight', HIGHLIGHT_COLORS, onSelectHighlight)}
        </div>,
        document.body
    );
};
