import { $patchStyleText, $setBlocksType } from '@lexical/selection';
import {
    $createParagraphNode,
    $getNodeByKey,
    $getSelection,
    $isElementNode,
    $isRangeSelection,
    ElementNode,
    LexicalEditor,
    LexicalNode,
    NodeKey,
} from 'lexical';
import {
    $createCollapsibleContainerNode,
    $createCollapsibleContentNode,
    $createCollapsibleTitleNode,
    $isCollapsibleContainerNode,
    $isCollapsibleContentNode,
} from '../nodes/CollapsibleNode';

/**
 * Resolves a node up to the nearest actionable block: its top-level ancestor, UNLESS that walk
 * would cross a toggle's content boundary, in which case it stops at the block just inside that
 * boundary. Plain `getTopLevelElementOrThrow()` would otherwise resolve a paragraph inside an
 * existing toggle's content all the way up to the toggle's own CollapsibleContainerNode, treating
 * the whole toggle as "the block" instead of the inner paragraph the user is actually acting on.
 */
function resolveActionableBlock(startNode: LexicalNode): ElementNode | null {
    let current: LexicalNode = startNode;
    for (; ;) {
        const parent = current.getParent();
        if (parent === null || $isCollapsibleContentNode(parent)) {
            return $isElementNode(current) ? current : null;
        }
        current = parent;
    }
}

/**
 * Resolves nodeKey to its actionable block, moves selection onto it, then hands the resulting
 * RangeSelection to `run`. Used by the block context menu's "Turn into" options, which act on
 * whatever block the drag handle is hovering - not necessarily wherever the cursor/selection
 * currently is, unlike the slash menu (invoked at the cursor itself). Returns whether targeting
 * actually happened, so callers that dispatch a command afterward (outside this update) know
 * whether to skip it rather than applying against a stale/wrong selection.
 */
function withTargetedSelection(editor: LexicalEditor, nodeKey: NodeKey, run: () => void): boolean {
    let didTarget = false;
    editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!node) return;
        const target = resolveActionableBlock(node);
        // A toggle's own container is never a valid "Turn into" target: $setBlocksType resolves
        // its block via Lexical's own block-matching, which (since the container disqualifies
        // itself via canBeEmpty() === false) lands on the inner title instead of the container,
        // silently corrupting the toggle's structure. The block context menu already hides these
        // options for toggle blocks; this guard is defense in depth.
        if (!target || $isCollapsibleContainerNode(target)) return;
        target.selectStart();
        run();
        didTarget = true;
    });
    return didTarget;
}

/** For simple 1:1 type swaps (paragraph/heading/quote/callout) - mirrors $setBlocksType usage
 *  already established in SlashMenuPlugin, just targeted at a specific node instead of the
 *  current selection. */
export function turnBlockInto(editor: LexicalEditor, nodeKey: NodeKey, createFn: () => ElementNode): void {
    withTargetedSelection(editor, nodeKey, () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            $setBlocksType(selection, createFn);
        }
    });
}

/** Applies a text/background color to an entire block's content (block context menu's "Color"),
 *  as opposed to the floating toolbar's color picker which applies to whatever the user manually
 *  selected. Selects the full block via ElementNode.select(0, size) first. */
export function applyColorToBlock(editor: LexicalEditor, nodeKey: NodeKey, styleKey: 'color' | 'background-color', value: string): void {
    editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!node || !$isElementNode(node)) return;
        const selection = node.select(0, node.getChildrenSize());
        $patchStyleText(selection, { [styleKey]: value });
    });
}

/** For list turn-into, which needs a dispatched command (INSERT_UNORDERED_LIST_COMMAND etc.)
 *  rather than $setBlocksType - dispatched right after the targeted selection is committed, so
 *  the list command's own internal update reads the correct (just-targeted) selection. */
export function turnBlockIntoViaCommand(editor: LexicalEditor, nodeKey: NodeKey, command: any, payload: any): void {
    const didTarget = withTargetedSelection(editor, nodeKey, () => { });
    if (!didTarget) return;
    editor.dispatchCommand(command, payload);
}

/**
 * Wraps the target block in a toggle (container/title/content) structure, moving its existing
 * content into the toggle's TITLE (not content), so text the user already wrote becomes the
 * toggle's visible, clickable header - matching Notion's "turn into toggle" behavior - rather
 * than disappearing into the collapsed body under a blank header. Assumes it's called from
 * within an already-active editor.update() (see wrapBlockAsToggle below for standalone callers).
 */
export function $wrapBlockAsToggle(nodeKey: NodeKey): void {
    const node = $getNodeByKey(nodeKey);
    if (!node) return;
    const target = resolveActionableBlock(node);
    if (!target) return;
    // Already a toggle (e.g. reached directly via the block context menu's "Turn into:
    // Toggle" on an existing toggle) - wrapping it again would nest a bare <summary>/content
    // pair with no <details> ancestor of their own. No-op instead of corrupting the structure.
    if ($isCollapsibleContainerNode(target)) return;

    const container = $createCollapsibleContainerNode(true);
    const title = $createCollapsibleTitleNode();
    const content = $createCollapsibleContentNode();

    const existingChildren = target.getChildren();
    if (existingChildren.length > 0) {
        existingChildren.forEach((child) => title.append(child));
    }
    content.append($createParagraphNode());

    container.append(title, content);
    target.replace(container);
    title.selectEnd();
}

/** Standalone entry point for callers not already inside an active editor.update() (the block
 *  context menu's "Turn into: Toggle" action, invoked from a plain onClick handler). */
export function wrapBlockAsToggle(editor: LexicalEditor, nodeKey: NodeKey): void {
    editor.update(() => $wrapBlockAsToggle(nodeKey));
}
