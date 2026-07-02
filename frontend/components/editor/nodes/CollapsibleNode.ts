import { addClassNamesToElement } from '@lexical/utils';
import {
    $applyNodeReplacement,
    $createParagraphNode,
    $getNodeByKey,
    EditorConfig,
    ElementNode,
    LexicalEditor,
    LexicalNode,
    NodeKey,
    ParagraphNode,
    RangeSelection,
    SerializedElementNode,
    Spread,
} from 'lexical';

/**
 * Toggle/collapsible blocks as three separate ElementNode classes (container/title/content),
 * mirroring Lexical's own official Playground pattern rather than a single node hand-managing
 * two visual regions - each class just extends ElementNode's default children/format/indent
 * serialization (no custom exportJSON beyond the container's `open` flag), which is what makes
 * this round-trip safely through JSON.stringify(editorState) -> Walrus -> parseEditorState().
 */

// ---------- Container (<details>) ----------

export type SerializedCollapsibleContainerNode = Spread<{ open: boolean }, SerializedElementNode>;

export class CollapsibleContainerNode extends ElementNode {
    __open: boolean;

    static getType(): string {
        return 'collapsible-container';
    }

    static clone(node: CollapsibleContainerNode): CollapsibleContainerNode {
        return new CollapsibleContainerNode(node.__open, node.__key);
    }

    constructor(open: boolean = true, key?: NodeKey) {
        super(key);
        this.__open = open;
    }

    getOpen(): boolean {
        return this.getLatest().__open;
    }

    setOpen(open: boolean): this {
        const self = this.getWritable();
        self.__open = open;
        return self;
    }

    createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
        const dom = document.createElement('details');
        dom.open = this.__open;
        addClassNamesToElement(dom, (config.theme as any).collapsibleContainer);

        // Native <details>/<summary> gives click-to-toggle for free, but the browser's `toggle`
        // event does NOT bubble - a listener registered on the editor root (e.g. via
        // NodeEventPlugin, which always attaches non-whitelisted event types in the bubble phase)
        // would never fire. Attaching directly to this node's own DOM element sidesteps that
        // entirely and is cleaned up automatically when Lexical discards the element.
        const nodeKey = this.getKey();
        dom.addEventListener('toggle', () => {
            editor.update(() => {
                const node = $getNodeByKey(nodeKey);
                if ($isCollapsibleContainerNode(node) && node.getOpen() !== dom.open) {
                    node.setOpen(dom.open);
                }
            });
        });

        return dom;
    }

    updateDOM(prevNode: this, dom: HTMLElement): boolean {
        if (prevNode.__open !== this.__open) {
            (dom as HTMLDetailsElement).open = this.__open;
        }
        return false;
    }

    static importJSON(serializedNode: SerializedCollapsibleContainerNode): CollapsibleContainerNode {
        const node = $createCollapsibleContainerNode(serializedNode.open);
        node.setFormat(serializedNode.format);
        node.setIndent(serializedNode.indent);
        node.setDirection(serializedNode.direction);
        return node;
    }

    exportJSON(): SerializedCollapsibleContainerNode {
        return {
            ...super.exportJSON(),
            type: 'collapsible-container',
            version: 1,
            open: this.__open,
        };
    }

    canBeEmpty(): boolean {
        return false;
    }

    insertNewAfter(_selection: RangeSelection, restoreSelection = true): ParagraphNode {
        const paragraph = $createParagraphNode();
        this.insertAfter(paragraph, restoreSelection);
        return paragraph;
    }
}

export function $createCollapsibleContainerNode(open: boolean = true): CollapsibleContainerNode {
    return $applyNodeReplacement(new CollapsibleContainerNode(open));
}

export function $isCollapsibleContainerNode(node: LexicalNode | null | undefined): node is CollapsibleContainerNode {
    return node instanceof CollapsibleContainerNode;
}

// ---------- Title (<summary>) ----------

export class CollapsibleTitleNode extends ElementNode {
    static getType(): string {
        return 'collapsible-title';
    }

    static clone(node: CollapsibleTitleNode): CollapsibleTitleNode {
        return new CollapsibleTitleNode(node.__key);
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = document.createElement('summary');
        addClassNamesToElement(dom, (config.theme as any).collapsibleTitle);
        return dom;
    }

    updateDOM(): boolean {
        return false;
    }

    static importJSON(serializedNode: SerializedElementNode): CollapsibleTitleNode {
        const node = $createCollapsibleTitleNode();
        node.setFormat(serializedNode.format);
        node.setIndent(serializedNode.indent);
        node.setDirection(serializedNode.direction);
        return node;
    }

    exportJSON(): SerializedElementNode {
        return {
            ...super.exportJSON(),
            type: 'collapsible-title',
            version: 1,
        };
    }

    canIndent(): boolean {
        return false;
    }

    // Enter inside the title moves the cursor into the content area's first paragraph (matching
    // Notion: pressing Enter on a toggle's header line starts writing its body), rather than
    // creating a second, sibling title.
    insertNewAfter(_selection: RangeSelection): LexicalNode | null {
        const container = this.getParent();
        if (!$isCollapsibleContainerNode(container)) return null;
        const content = container.getChildren().find($isCollapsibleContentNode);
        if (!content) return null;
        const firstChild = content.getFirstChild();
        if (firstChild) {
            firstChild.selectStart();
            return null;
        }
        const paragraph = $createParagraphNode();
        content.append(paragraph);
        paragraph.selectStart();
        return null;
    }

    // Backspace at the very start of a toggle's title unwraps the whole toggle back into plain
    // paragraphs (title text first, then the content's children flattened after it), rather than
    // silently swallowing the keystroke - returning `true` with no transform (the original bug
    // here) tells Lexical "the collapse was handled" while doing nothing, making it impossible to
    // ever remove a toggle via Backspace.
    collapseAtStart(): boolean {
        const container = this.getParent();
        if (!$isCollapsibleContainerNode(container)) return false;
        const content = container.getChildren().find($isCollapsibleContentNode);

        const paragraph = $createParagraphNode();
        this.getChildren().forEach((child) => paragraph.append(child));

        container.insertBefore(paragraph);
        let insertAfterNode: LexicalNode = paragraph;
        if (content) {
            content.getChildren().forEach((child) => {
                insertAfterNode.insertAfter(child);
                insertAfterNode = child;
            });
        }
        container.remove();
        paragraph.selectStart();
        return true;
    }
}

export function $createCollapsibleTitleNode(): CollapsibleTitleNode {
    return $applyNodeReplacement(new CollapsibleTitleNode());
}

export function $isCollapsibleTitleNode(node: LexicalNode | null | undefined): node is CollapsibleTitleNode {
    return node instanceof CollapsibleTitleNode;
}

// ---------- Content (<div>) ----------

export class CollapsibleContentNode extends ElementNode {
    static getType(): string {
        return 'collapsible-content';
    }

    static clone(node: CollapsibleContentNode): CollapsibleContentNode {
        return new CollapsibleContentNode(node.__key);
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = document.createElement('div');
        addClassNamesToElement(dom, (config.theme as any).collapsibleContent);
        return dom;
    }

    updateDOM(): boolean {
        return false;
    }

    static importJSON(serializedNode: SerializedElementNode): CollapsibleContentNode {
        const node = $createCollapsibleContentNode();
        node.setFormat(serializedNode.format);
        node.setIndent(serializedNode.indent);
        node.setDirection(serializedNode.direction);
        return node;
    }

    exportJSON(): SerializedElementNode {
        return {
            ...super.exportJSON(),
            type: 'collapsible-content',
            version: 1,
        };
    }
}

export function $createCollapsibleContentNode(): CollapsibleContentNode {
    return $applyNodeReplacement(new CollapsibleContentNode());
}

export function $isCollapsibleContentNode(node: LexicalNode | null | undefined): node is CollapsibleContentNode {
    return node instanceof CollapsibleContentNode;
}
