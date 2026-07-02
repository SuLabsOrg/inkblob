import { Check, ExternalLink, Copy, Trash2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../../hooks/useClickOutside';

interface LinkEditPopoverProps {
    /** Null when the selection isn't currently a link (shows a plain "add link" input instead). */
    currentUrl: string | null;
    position: { top: number; left: number };
    onApply: (url: string) => void;
    onRemove: () => void;
    onClose: () => void;
}

/**
 * Replaces the native prompt()-based link editing with an inline popover, matching the visual/
 * portal pattern already established by SlashMenuPopover (fixed + portaled + fade/zoom-in).
 */
export const LinkEditPopover: React.FC<LinkEditPopoverProps> = ({ currentUrl, position, onApply, onRemove, onClose }) => {
    const [value, setValue] = useState(currentUrl ?? '');
    const [copied, setCopied] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    useClickOutside(containerRef, onClose);

    const submit = () => {
        const trimmed = value.trim();
        if (trimmed) onApply(trimmed);
        onClose();
    };

    const copyUrl = async () => {
        if (!currentUrl) return;
        await navigator.clipboard.writeText(currentUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    return createPortal(
        <div
            ref={containerRef}
            className="fixed z-50 w-72 rounded-lg border border-web3-border bg-web3-card shadow-xl p-2 animate-in fade-in zoom-in-95 duration-100"
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-1.5">
                <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Paste or type a URL..."
                    className="flex-1 min-w-0 bg-web3-bg/50 px-2 py-1.5 text-sm rounded border border-web3-border outline-none text-web3-text placeholder-web3-textMuted focus:border-web3-primary/50"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') submit();
                        if (e.key === 'Escape') onClose();
                    }}
                />
                <button
                    onClick={submit}
                    title="Apply"
                    aria-label="Apply link"
                    className="p-1.5 rounded hover:bg-web3-cardHover text-web3-primary shrink-0"
                >
                    <Check size={15} />
                </button>
            </div>

            {currentUrl && (
                <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-web3-border/50">
                    <a
                        href={currentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in new tab"
                        className="flex items-center gap-1.5 flex-1 min-w-0 px-2 py-1 text-xs rounded text-web3-textMuted hover:bg-web3-cardHover hover:text-web3-text"
                    >
                        <ExternalLink size={13} className="shrink-0" />
                        <span className="truncate">{currentUrl}</span>
                    </a>
                    <button
                        onClick={copyUrl}
                        title="Copy link"
                        aria-label="Copy link"
                        className="p-1.5 rounded hover:bg-web3-cardHover text-web3-textMuted hover:text-web3-text shrink-0"
                    >
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    <button
                        onClick={() => { onRemove(); onClose(); }}
                        title="Remove link"
                        aria-label="Remove link"
                        className="p-1.5 rounded hover:bg-red-500/10 text-web3-textMuted hover:text-red-400 shrink-0"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            )}
        </div>,
        document.body
    );
};
