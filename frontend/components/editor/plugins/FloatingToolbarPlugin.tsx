import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, SELECTION_CHANGE_COMMAND } from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Italic, Underline, Code, Link, Strikethrough } from 'lucide-react';
import { mergeRegister } from '@lexical/utils';
import { $isCodeHighlightNode } from '@lexical/code';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';

const FloatingToolbar = ({
    editor,
    anchorElem,
}: {
    editor: any;
    anchorElem: HTMLElement;
}) => {
    const popupCharStylesEditorRef = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [isStrikethrough, setIsStrikethrough] = useState(false);
    const [isCode, setIsCode] = useState(false);
    const [isLink, setIsLink] = useState(false);

    const updateToolbar = useCallback(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            const anchorNode = selection.anchor.getNode();
            const element = anchorNode.getKey() === 'root'
                ? anchorNode
                : anchorNode.getTopLevelElementOrThrow();
            const elementKey = element.getKey();
            const elementDOM = editor.getElementByKey(elementKey);

            if (elementDOM !== null) {
                setIsBold(selection.hasFormat('bold'));
                setIsItalic(selection.hasFormat('italic'));
                setIsUnderline(selection.hasFormat('underline'));
                setIsStrikethrough(selection.hasFormat('strikethrough'));
                setIsCode(selection.hasFormat('code'));

                // Check for link
                const parent = anchorNode.getParent();
                if ($isLinkNode(parent) || $isLinkNode(anchorNode)) {
                    setIsLink(true);
                } else {
                    setIsLink(false);
                }
            }

            const nativeSelection = window.getSelection();
            const rootElement = editor.getRootElement();

            if (
                nativeSelection !== null &&
                (!nativeSelection.isCollapsed) &&
                rootElement !== null &&
                rootElement.contains(nativeSelection.anchorNode)
            ) {
                const range = nativeSelection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                // Calculate position relative to the viewport/anchorElem
                // We want it centered above the selection
                setPosition({
                    top: rect.top - 50, // 50px above
                    left: rect.left + rect.width / 2,
                });
            } else {
                setPosition(null);
            }
        } else {
            setPosition(null);
        }
    }, [editor]);

    useEffect(() => {
        return mergeRegister(
            editor.registerUpdateListener(({ editorState }: any) => {
                editorState.read(() => {
                    updateToolbar();
                });
            }),
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    updateToolbar();
                    return false;
                },
                1,
            ),
        );
    }, [editor, updateToolbar]);

    if (!position) return null;

    return createPortal(
        <div
            className="fixed z-50 flex items-center gap-1 p-1 rounded-lg bg-web3-card border border-web3-border shadow-xl animate-in fade-in zoom-in-95 duration-100 transform -translate-x-1/2"
            style={{ top: position.top, left: position.left }}
            ref={popupCharStylesEditorRef}
        >
            <button
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
                className={`p-1.5 rounded hover:bg-web3-cardHover transition-colors ${isBold ? 'text-web3-primary bg-web3-primary/10' : 'text-web3-textMuted'}`}
                title="Bold"
            >
                <Bold size={16} />
            </button>
            <button
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
                className={`p-1.5 rounded hover:bg-web3-cardHover transition-colors ${isItalic ? 'text-web3-primary bg-web3-primary/10' : 'text-web3-textMuted'}`}
                title="Italic"
            >
                <Italic size={16} />
            </button>
            <button
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
                className={`p-1.5 rounded hover:bg-web3-cardHover transition-colors ${isUnderline ? 'text-web3-primary bg-web3-primary/10' : 'text-web3-textMuted'}`}
                title="Underline"
            >
                <Underline size={16} />
            </button>
            <button
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
                className={`p-1.5 rounded hover:bg-web3-cardHover transition-colors ${isStrikethrough ? 'text-web3-primary bg-web3-primary/10' : 'text-web3-textMuted'}`}
                title="Strikethrough"
            >
                <Strikethrough size={16} />
            </button>
            <button
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
                className={`p-1.5 rounded hover:bg-web3-cardHover transition-colors ${isCode ? 'text-web3-primary bg-web3-primary/10' : 'text-web3-textMuted'}`}
                title="Code"
            >
                <Code size={16} />
            </button>
            <div className="w-[1px] h-4 bg-web3-border mx-1"></div>
            <button
                onClick={() => {
                    if (isLink) {
                        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
                    } else {
                        // Simple prompt for now, could be a modal
                        const url = prompt('Enter URL:');
                        if (url) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
                    }
                }}
                className={`p-1.5 rounded hover:bg-web3-cardHover transition-colors ${isLink ? 'text-web3-primary bg-web3-primary/10' : 'text-web3-textMuted'}`}
                title="Link"
            >
                <Link size={16} />
            </button>
        </div>,
        anchorElem
    );
};

export default function FloatingToolbarPlugin({
    anchorElem = document.body,
}: {
    anchorElem?: HTMLElement;
}) {
    const [editor] = useLexicalComposerContext();
    return <FloatingToolbar editor={editor} anchorElem={anchorElem} />;
}
