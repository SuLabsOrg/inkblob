import {
    $getNodeByKey,
    $isElementNode,
    $parseSerializedNode,
    LexicalEditor,
    LexicalNode,
    NodeKey,
    SerializedLexicalNode,
} from 'lexical';

/**
 * node.exportJSON() alone always returns an empty `children` array for ElementNode subclasses -
 * that array is only populated by Lexical's own internal (non-exported) exportNodeToJSON helper,
 * which EditorState.toJSON() uses to recursively walk getChildren(). This reimplements that same
 * recursive walk so a clone actually carries its content instead of coming out empty.
 */
function exportNodeToJSON(node: LexicalNode): SerializedLexicalNode {
    const serialized = node.exportJSON();
    if ($isElementNode(node)) {
        (serialized as SerializedLexicalNode & { children: SerializedLexicalNode[] }).children =
            node.getChildren().map(exportNodeToJSON);
    }
    return serialized;
}

/**
 * Duplicates the block at nodeKey and inserts the copy immediately after it, moving selection
 * into the copy. Uses a full JSON export/re-parse round-trip (via $parseSerializedNode) rather
 * than the node class's own `clone()` - `clone()` is a shallow copy that would share child node
 * references with the original, corrupting both once either is edited; re-parsing from recursively
 * exported JSON produces an independent deep copy (including nested children like list items,
 * table rows, or toggle content) the same way loading a note's content from Walrus already does.
 */
export function duplicateBlock(editor: LexicalEditor, nodeKey: NodeKey): void {
    editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!node) return;

        const clone = $parseSerializedNode(exportNodeToJSON(node));
        node.insertAfter(clone);

        if (typeof (clone as any).selectEnd === 'function') {
            (clone as any).selectEnd();
        }
    });
}
