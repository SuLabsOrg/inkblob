import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { $createParagraphNode, NodeKey, $getNodeByKey } from 'lexical';
import { $isCollapsibleContainerNode } from '../nodes/CollapsibleNode';
import {
    Copy,
    Trash2,
    Type,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    Lightbulb,
    ChevronRight,
} from 'lucide-react';
import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { $createCalloutNode } from '../nodes/CalloutNode';
import { duplicateBlock } from '../utils/duplicateNode';
import { applyColorToBlock, turnBlockInto, turnBlockIntoViaCommand, wrapBlockAsToggle } from '../utils/blockTransforms';
import { HIGHLIGHT_COLORS, TEXT_COLORS } from './ColorPickerPopover';
import { useClickOutside } from '../../../hooks/useClickOutside';

interface BlockContextMenuProps {
    nodeKey: NodeKey;
    position: { top: number; left: number };
    onClose: () => void;
}

/**
 * Duplicate/Delete/Turn-into/Color popover opened from the drag handle - follows the same
 * fixed+portaled+fade/zoom-in pattern already established by SlashMenuPopover.
 */
export const BlockContextMenu: React.FC<BlockContextMenuProps> = ({ nodeKey, position, onClose }) => {
    const [editor] = useLexicalComposerContext();
    const containerRef = useRef<HTMLDivElement>(null);
    useClickOutside(containerRef, onClose);

    const run = (action: () => void) => {
        action();
        onClose();
    };

    // "Turn into" conversions don't apply to a toggle's own container - $setBlocksType and
    // wrapBlockAsToggle both guard against it (would otherwise land on the inner title or
    // double-wrap), so hide the whole section rather than offering options that silently no-op.
    const isToggleTarget = editor.getEditorState().read(() => $isCollapsibleContainerNode($getNodeByKey(nodeKey)));

    const turnIntoOptions: Array<{ label: string; icon: React.ReactNode; action: () => void }> = isToggleTarget ? [] : [
        { label: 'Text', icon: <Type size={14} />, action: () => turnBlockInto(editor, nodeKey, () => $createParagraphNode()) },
        { label: 'Heading 1', icon: <Heading1 size={14} />, action: () => turnBlockInto(editor, nodeKey, () => $createHeadingNode('h1')) },
        { label: 'Heading 2', icon: <Heading2 size={14} />, action: () => turnBlockInto(editor, nodeKey, () => $createHeadingNode('h2')) },
        { label: 'Heading 3', icon: <Heading3 size={14} />, action: () => turnBlockInto(editor, nodeKey, () => $createHeadingNode('h3')) },
        { label: 'Bullet List', icon: <List size={14} />, action: () => turnBlockIntoViaCommand(editor, nodeKey, INSERT_UNORDERED_LIST_COMMAND, undefined) },
        { label: 'Numbered List', icon: <ListOrdered size={14} />, action: () => turnBlockIntoViaCommand(editor, nodeKey, INSERT_ORDERED_LIST_COMMAND, undefined) },
        { label: 'Quote', icon: <Quote size={14} />, action: () => turnBlockInto(editor, nodeKey, () => $createQuoteNode()) },
        { label: 'Callout', icon: <Lightbulb size={14} />, action: () => turnBlockInto(editor, nodeKey, () => $createCalloutNode()) },
        { label: 'Toggle List', icon: <ChevronRight size={14} />, action: () => wrapBlockAsToggle(editor, nodeKey) },
    ];

    return createPortal(
        <div
            ref={containerRef}
            className="fixed z-50 w-60 rounded-lg border border-web3-border bg-web3-card shadow-xl p-1 animate-in fade-in zoom-in-95 duration-100"
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()}
        >
            <button
                onClick={() => run(() => duplicateBlock(editor, nodeKey))}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded text-web3-text hover:bg-web3-cardHover"
            >
                <Copy size={14} /> Duplicate
            </button>
            <button
                onClick={() => run(() => editor.update(() => { $getNodeByKey(nodeKey)?.remove(); }))}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded text-web3-textMuted hover:bg-red-500/10 hover:text-red-400"
            >
                <Trash2 size={14} /> Delete
            </button>

            {turnIntoOptions.length > 0 && (
                <>
                    <div className="h-[1px] bg-web3-border/50 my-1" />
                    <div className="text-[10px] font-semibold text-web3-textMuted uppercase tracking-wider px-2 mb-1">Turn into</div>
                    <div className="grid grid-cols-3 gap-0.5 px-1 pb-1">
                        {turnIntoOptions.map((opt) => (
                            <button
                                key={opt.label}
                                title={opt.label}
                                aria-label={`Turn into ${opt.label}`}
                                onClick={() => run(opt.action)}
                                className="flex items-center justify-center p-1.5 rounded text-web3-textMuted hover:bg-web3-cardHover hover:text-web3-primary"
                            >
                                {opt.icon}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <div className="h-[1px] bg-web3-border/50 my-1" />
            <div className="text-[10px] font-semibold text-web3-textMuted uppercase tracking-wider px-2 mb-1">Color</div>
            <div className="flex items-center gap-1 px-2 pb-1">
                {TEXT_COLORS.map((c) => (
                    <button
                        key={c.label}
                        title={c.label}
                        aria-label={`Text color: ${c.label}`}
                        onClick={() => run(() => applyColorToBlock(editor, nodeKey, 'color', c.value))}
                        className="w-5 h-5 rounded-full border border-web3-border hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.swatch === 'transparent' ? 'transparent' : c.swatch, opacity: c.swatch === 'transparent' ? 1 : 0.85 }}
                    />
                ))}
            </div>
            <div className="flex items-center gap-1 px-2 pb-1">
                {HIGHLIGHT_COLORS.map((c) => (
                    <button
                        key={c.label}
                        title={c.label}
                        aria-label={`Highlight color: ${c.label}`}
                        onClick={() => run(() => applyColorToBlock(editor, nodeKey, 'background-color', c.value))}
                        className="w-5 h-5 rounded-full border border-web3-border hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.swatch === 'transparent' ? 'transparent' : c.swatch, opacity: c.swatch === 'transparent' ? 1 : 0.85 }}
                    />
                ))}
            </div>
        </div>,
        document.body
    );
};
