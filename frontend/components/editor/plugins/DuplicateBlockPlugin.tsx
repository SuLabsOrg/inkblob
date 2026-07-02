import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_NORMAL, KEY_DOWN_COMMAND } from 'lexical';
import { duplicateBlock } from '../utils/duplicateNode';

/**
 * Cmd/Ctrl+D duplicates the block containing the current selection - the same duplicateBlock
 * helper the block context menu's "Duplicate" action uses (one code path, two triggers).
 */
export default function DuplicateBlockPlugin() {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return editor.registerCommand(
            KEY_DOWN_COMMAND,
            (event: KeyboardEvent) => {
                const isModifier = event.metaKey || event.ctrlKey;
                if (!isModifier || event.key.toLowerCase() !== 'd') return false;

                let blockKey: string | null = null;
                editor.getEditorState().read(() => {
                    const selection = $getSelection();
                    if (!$isRangeSelection(selection)) return;
                    const anchorNode = selection.anchor.getNode();
                    const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
                    blockKey = element.getKey();
                });

                if (!blockKey) return false;

                event.preventDefault();
                duplicateBlock(editor, blockKey);
                return true;
            },
            COMMAND_PRIORITY_NORMAL
        );
    }, [editor]);

    return null;
}
