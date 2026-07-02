import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { DraggableBlockPlugin_EXPERIMENTAL } from '@lexical/react/LexicalDraggableBlockPlugin';
import { $createParagraphNode, $getNearestNodeFromDOMNode, $isElementNode } from 'lexical';
import { GripVertical, Plus } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { BlockContextMenu } from '../ui/BlockContextMenu';

interface DragHandlePluginProps {
    anchorElem: HTMLElement;
}

/**
 * Per-block hover drag handle + "+" add-block button, wrapping Lexical's own official
 * DraggableBlockPlugin_EXPERIMENTAL (Meta's real Playground drag-handle code - it owns all the
 * DOM/pointer mechanics for hover detection, drag-image, and dragover/drop reordering). This
 * component only supplies the visual menu/target-line and resolves which node is hovered so the
 * "+" button and the block context menu (opened by clicking the handle) know what to act on.
 */
export default function DragHandlePlugin({ anchorElem }: DragHandlePluginProps) {
    const [editor] = useLexicalComposerContext();
    const menuRef = useRef<HTMLDivElement>(null);
    const targetLineRef = useRef<HTMLDivElement>(null);
    const hoveredElementRef = useRef<HTMLElement | null>(null);
    const [contextMenu, setContextMenu] = useState<{ nodeKey: string; position: { top: number; left: number } } | null>(null);

    const resolveHoveredNodeKey = (): string | null => {
        if (!hoveredElementRef.current) return null;
        let nodeKey: string | null = null;
        editor.getEditorState().read(() => {
            const node = $getNearestNodeFromDOMNode(hoveredElementRef.current!);
            if (node) nodeKey = node.getKey();
        });
        return nodeKey;
    };

    const handleAddBelow = () => {
        const el = hoveredElementRef.current;
        if (!el) return;
        editor.update(() => {
            const node = $getNearestNodeFromDOMNode(el);
            if (!node) return;
            const target = $isElementNode(node) ? node.getTopLevelElementOrThrow() : node;
            const paragraph = $createParagraphNode();
            target.insertAfter(paragraph);
            paragraph.selectStart();
        });
    };

    const handleOpenMenu = (event: React.MouseEvent) => {
        const nodeKey = resolveHoveredNodeKey();
        if (!nodeKey) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setContextMenu({ nodeKey, position: { top: rect.bottom + 4, left: rect.left } });
    };

    return (
        <>
            <DraggableBlockPlugin_EXPERIMENTAL
                anchorElem={anchorElem}
                menuRef={menuRef}
                targetLineRef={targetLineRef}
                onElementChanged={(element) => { hoveredElementRef.current = element; }}
                isOnMenu={(element) => !!element.closest('[data-drag-handle-menu]')}
                menuComponent={
                    <div
                        ref={menuRef}
                        data-drag-handle-menu
                        className="absolute left-0 top-0 flex items-center gap-0.5"
                    >
                        <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleAddBelow}
                            title="Add block below"
                            aria-label="Add block below"
                            className="p-0.5 rounded hover:bg-web3-cardHover text-web3-textMuted hover:text-web3-primary"
                        >
                            <Plus size={16} />
                        </button>
                        <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleOpenMenu}
                            title="Drag to move - click for options"
                            aria-label="Drag to move, or click for block options"
                            className="p-0.5 rounded hover:bg-web3-cardHover text-web3-textMuted hover:text-web3-primary cursor-grab active:cursor-grabbing"
                        >
                            <GripVertical size={16} />
                        </button>
                    </div>
                }
                targetLineComponent={
                    <div
                        ref={targetLineRef}
                        className="absolute left-0 top-0 h-0.5 bg-web3-primary rounded-full pointer-events-none"
                    />
                }
            />
            {contextMenu && (
                <BlockContextMenu
                    nodeKey={contextMenu.nodeKey}
                    position={contextMenu.position}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </>
    );
}
