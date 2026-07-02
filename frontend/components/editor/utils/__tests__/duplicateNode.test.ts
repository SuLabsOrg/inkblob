import { describe, expect, it } from 'vitest';
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from 'lexical';
import { duplicateBlock } from '../duplicateNode';

// Regression test for a critical data-loss bug caught by self-code-review: duplicateBlock
// originally cloned via node.exportJSON() directly, which always returns an empty `children`
// array for ElementNode subclasses (that array is only populated by Lexical's own internal,
// non-exported recursive walk) - so every "duplicate" silently produced an empty block.
// editor.update() commits are scheduled via queueMicrotask rather than applied synchronously, so
// tests must await a microtask tick before editor.getEditorState() reflects a just-made update.
const flush = () => Promise.resolve();

describe('duplicateBlock', () => {
    it('deep-clones a block, preserving its text content', async () => {
        const editor = createEditor();
        let originalKey = '';

        editor.update(() => {
            const root = $getRoot();
            const paragraph = $createParagraphNode();
            paragraph.append($createTextNode('hello world'));
            root.append(paragraph);
            originalKey = paragraph.getKey();
        });
        await flush();

        duplicateBlock(editor, originalKey);
        await flush();

        const texts = editor.getEditorState().read(() =>
            $getRoot().getChildren().map((child) => child.getTextContent())
        );

        expect(texts).toEqual(['hello world', 'hello world']);
    });

    it('produces a clone with an independent node key', async () => {
        const editor = createEditor();
        let originalKey = '';

        editor.update(() => {
            const root = $getRoot();
            const paragraph = $createParagraphNode();
            paragraph.append($createTextNode('a'));
            root.append(paragraph);
            originalKey = paragraph.getKey();
        });
        await flush();

        duplicateBlock(editor, originalKey);
        await flush();

        const keys = editor.getEditorState().read(() =>
            $getRoot().getChildren().map((child) => child.getKey())
        );

        expect(keys).toHaveLength(2);
        expect(keys[0]).not.toBe(keys[1]);
    });
});
