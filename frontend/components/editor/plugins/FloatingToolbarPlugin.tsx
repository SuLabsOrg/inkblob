import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, $setSelection, FORMAT_TEXT_COMMAND, RangeSelection, SELECTION_CHANGE_COMMAND } from 'lexical';
import { $patchStyleText } from '@lexical/selection';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Italic, Underline, Code, Link, Strikethrough, Palette } from 'lucide-react';
import { mergeRegister } from '@lexical/utils';
import { $isCodeHighlightNode } from '@lexical/code';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { LinkEditPopover } from '../ui/LinkEditPopover';
import { ColorPickerPopover } from '../ui/ColorPickerPopover';

const FloatingToolbar = ({
    editor,
    anchorElem,
}: {
    editor: any;
    anchorElem: HTMLElement;
}) => {
    const popupCharStylesEditorRef = useRef<HTMLDivElement | null>(null);
    const linkButtonRef = useRef<HTMLButtonElement | null>(null);
    // Captures the last valid range selection so the link popover (whose input holds focus for
    // an extended interaction, unlike a single button click) can restore it before applying/
    // removing a link - clicking into a portaled input moves focus off the contenteditable, and
    // while Lexical tolerates a brief blur for one-shot button clicks (that's why Bold/Italic
    // already work from this same toolbar), it isn't safe to assume the selection survives a
    // longer-lived focus elsewhere without restoring it explicitly first.
    const lastSelectionRef = useRef<RangeSelection | null>(null);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [isStrikethrough, setIsStrikethrough] = useState(false);
    const [isCode, setIsCode] = useState(false);
    const [isLink, setIsLink] = useState(false);
    const [currentLinkUrl, setCurrentLinkUrl] = useState<string | null>(null);
    const [linkPopoverPosition, setLinkPopoverPosition] = useState<{ top: number; left: number } | null>(null);
    const colorButtonRef = useRef<HTMLButtonElement | null>(null);
    const [colorPopoverPosition, setColorPopoverPosition] = useState<{ top: number; left: number } | null>(null);

    const updateToolbar = useCallback(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            lastSelectionRef.current = selection.clone();

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
                if ($isLinkNode(parent)) {
                    setIsLink(true);
                    setCurrentLinkUrl(parent.getURL());
                } else if ($isLinkNode(anchorNode)) {
                    setIsLink(true);
                    setCurrentLinkUrl(anchorNode.getURL());
                } else {
                    setIsLink(false);
                    setCurrentLinkUrl(null);
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

    const openLinkPopover = () => {
        const rect = linkButtonRef.current?.getBoundingClientRect();
        if (!rect) return;
        setLinkPopoverPosition({ top: rect.bottom + 6, left: Math.max(8, rect.left - 128) });
    };

    const openColorPopover = () => {
        const rect = colorButtonRef.current?.getBoundingClientRect();
        if (!rect) return;
        setColorPopoverPosition({ top: rect.bottom + 6, left: Math.max(8, rect.left - 96) });
    };

    /** Restores the selection captured when the toolbar was last shown, then runs the update. */
    const withRestoredSelection = (run: () => void) => {
        editor.update(() => {
            if (lastSelectionRef.current) {
                $setSelection(lastSelectionRef.current.clone());
            }
            run();
        });
    };

    return (
        <>
            {position && createPortal(
                <div
                    className="fixed z-50 flex items-center gap-1 p-1 rounded-lg bg-web3-card border border-web3-border shadow-xl animate-in fade-in zoom-in-95 duration-100 transform -translate-x-1/2"
                    style={{ top: position.top, left: position.left }}
                    ref={popupCharStylesEditorRef}
                >
                    <button
                        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
                        className={`p-1.5 rounded hover:bg-web3-cardHover transition-colors ${isBold ? 'text-web3-primary bg-web3-primary/10' : 'text-web3-textMuted'}`}
                        title="Bold"
                        aria-label="Bold"
                        aria-pressed={isBold}
                    >
                        <Bold size={16} />
                    </button>
                    <button
                        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
                        className={`p-1.5 rounded hover:bg-web3-cardHover transition-colors ${isItalic ? 'text-web3-primary bg-web3-primary/10' : 'text-web3-textMuted'}`}
                        title="Italic"
                        aria-label="Italic"
                        aria-pressed={isItalic}
                    >
                        <Italic size={16} />
                    </button>
                    <button
                        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
                        className={`p-1.5 rounded hover:bg-web3-cardHover transition-colors ${isUnderline ? 'text-web3-primary bg-web3-primary/10' : 'text-web3-textMuted'}`}
                        title="Underline"
                        aria-label="Underline"
                        aria-pressed={isUnderline}
                    >
                        <Underline size={16} />
                    </button>
                    <button
                        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
                        className={`p-1.5 rounded hover:bg-web3-cardHover transition-colors ${isStrikethrough ? 'text-web3-primary bg-web3-primary/10' : 'text-web3-textMuted'}`}
                        title="Strikethrough"
                        aria-label="Strikethrough"
                        aria-pressed={isStrikethrough}
                    >
                        <Strikethrough size={16} />
                    </button>
                    <button
                        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
                        className={`p-1.5 rounded hover:bg-web3-cardHover transition-colors ${isCode ? 'text-web3-primary bg-web3-primary/10' : 'text-web3-textMuted'}`}
                        title="Code"
                        aria-label="Code"
                        aria-pressed={isCode}
                    >
                        <Code size={16} />
                    </button>
                    <div className="w-[1px] h-4 bg-web3-border mx-1"></div>
                    <button
                        ref={linkButtonRef}
                        onClick={openLinkPopover}
                        className={`p-1.5 rounded hover:bg-web3-cardHover transition-colors ${isLink ? 'text-web3-primary bg-web3-primary/10' : 'text-web3-textMuted'}`}
                        title="Link"
                        aria-label="Link"
                        aria-pressed={isLink}
                    >
                        <Link size={16} />
                    </button>
                    <div className="w-[1px] h-4 bg-web3-border mx-1"></div>
                    <button
                        ref={colorButtonRef}
                        onClick={openColorPopover}
                        className="p-1.5 rounded hover:bg-web3-cardHover transition-colors text-web3-textMuted"
                        title="Color"
                        aria-label="Text and highlight color"
                    >
                        <Palette size={16} />
                    </button>
                </div>,
                anchorElem
            )}

            {/* Rendered outside the toolbar's own `position &&` gate so it survives the toolbar
                hiding when the popover's input/click steals focus from the contenteditable. */}
            {linkPopoverPosition && (
                <LinkEditPopover
                    currentUrl={currentLinkUrl}
                    position={linkPopoverPosition}
                    onApply={(url) => withRestoredSelection(() => editor.dispatchCommand(TOGGLE_LINK_COMMAND, url))}
                    onRemove={() => withRestoredSelection(() => editor.dispatchCommand(TOGGLE_LINK_COMMAND, null))}
                    onClose={() => setLinkPopoverPosition(null)}
                />
            )}

            {colorPopoverPosition && (
                <ColorPickerPopover
                    position={colorPopoverPosition}
                    onSelectTextColor={(value) => withRestoredSelection(() => {
                        const selection = $getSelection();
                        if (selection) $patchStyleText(selection, { color: value });
                    })}
                    onSelectHighlight={(value) => withRestoredSelection(() => {
                        const selection = $getSelection();
                        if (selection) $patchStyleText(selection, { 'background-color': value });
                    })}
                    onClose={() => setColorPopoverPosition(null)}
                />
            )}
        </>
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
