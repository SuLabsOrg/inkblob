import { Folder as FolderIcon, Home } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder } from '../types';
import { buildFolderTree, flattenFolderTree } from '../utils/folderTree';
import { useClickOutside } from '../hooks/useClickOutside';

interface FolderPickerProps {
    folders: Folder[];
    anchorRect: { top: number; left: number; right: number };
    onSelect: (folderId: string | null) => void;
    onClose: () => void;
}

export const FolderPicker: React.FC<FolderPickerProps> = ({ folders, anchorRect, onSelect, onClose }) => {
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    const flattened = useMemo(() => flattenFolderTree(buildFolderTree(folders)), [folders]);
    const filtered = query.trim()
        ? flattened.filter(f => f.folder.name.toLowerCase().includes(query.trim().toLowerCase()))
        : flattened;

    useClickOutside(containerRef, onClose);

    const top = anchorRect.top;
    const left = Math.min(anchorRect.left, window.innerWidth - 260);

    return createPortal(
        <div
            ref={containerRef}
            className="fixed z-50 w-60 max-h-80 flex flex-col rounded-lg border border-web3-border bg-web3-card shadow-xl animate-in fade-in zoom-in-95 duration-100"
            style={{ top, left }}
        >
            <div className="p-2 border-b border-web3-border/50">
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search folders..."
                    className="w-full bg-web3-bg/50 px-2 py-1 text-sm rounded border border-web3-border outline-none text-web3-text placeholder-web3-textMuted focus:border-web3-primary/50"
                />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                <button
                    onClick={() => onSelect(null)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-web3-text hover:bg-web3-cardHover"
                >
                    <Home size={14} className="text-web3-textMuted" />
                    Notes (root)
                </button>
                {filtered.map(({ folder, depth }) => (
                    <button
                        key={folder.id}
                        onClick={() => onSelect(folder.id)}
                        style={{ paddingLeft: 8 + depth * 14 }}
                        className="w-full flex items-center gap-2 py-1.5 pr-2 rounded text-sm text-web3-text hover:bg-web3-cardHover"
                    >
                        <FolderIcon size={14} className="text-web3-textMuted shrink-0" />
                        <span className="truncate">{folder.name}</span>
                    </button>
                ))}
                {filtered.length === 0 && (
                    <div className="px-2 py-3 text-xs text-web3-textMuted text-center">No folders found</div>
                )}
            </div>
        </div>,
        document.body
    );
};
