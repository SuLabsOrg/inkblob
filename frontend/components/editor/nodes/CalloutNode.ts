import { addClassNamesToElement } from '@lexical/utils';
import {
    $applyNodeReplacement,
    $createParagraphNode,
    EditorConfig,
    ElementDOMSlot,
    ElementNode,
    LexicalNode,
    NodeKey,
    ParagraphNode,
    RangeSelection,
    SerializedElementNode,
    Spread,
} from 'lexical';

export type CalloutColor = 'gray' | 'purple' | 'pink' | 'cyan' | 'red' | 'green';

export type SerializedCalloutNode = Spread<
    { icon: string; color: CalloutColor },
    SerializedElementNode
>;

const DEFAULT_ICON = '💡';
const DEFAULT_COLOR: CalloutColor = 'gray';

/**
 * A single flat ElementNode (modeled directly on @lexical/rich-text's QuoteNode - same
 * insertNewAfter/collapseAtStart/canMergeWhenEmpty shape) with two extra serialized properties:
 * an emoji icon and a color, both changeable from the block context menu.
 */
export class CalloutNode extends ElementNode {
    __icon: string;
    __color: CalloutColor;

    static getType(): string {
        return 'callout';
    }

    static clone(node: CalloutNode): CalloutNode {
        return new CalloutNode(node.__icon, node.__color, node.__key);
    }

    constructor(icon: string = DEFAULT_ICON, color: CalloutColor = DEFAULT_COLOR, key?: NodeKey) {
        super(key);
        this.__icon = icon;
        this.__color = color;
    }

    getIcon(): string {
        return this.getLatest().__icon;
    }

    setIcon(icon: string): this {
        const self = this.getWritable();
        self.__icon = icon;
        return self;
    }

    getColor(): CalloutColor {
        return this.getLatest().__color;
    }

    setColor(color: CalloutColor): this {
        const self = this.getWritable();
        self.__color = color;
        return self;
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = document.createElement('div');
        const theme = config.theme.callout as Record<string, string> | undefined;
        addClassNamesToElement(dom, theme?.container, theme?.[this.__color]);

        const iconSpan = document.createElement('span');
        iconSpan.className = 'callout-icon';
        iconSpan.textContent = this.__icon;
        iconSpan.contentEditable = 'false';
        dom.appendChild(iconSpan);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'callout-content flex-1 min-w-0';
        dom.appendChild(contentDiv);

        return dom;
    }

    // Without this override, Lexical's reconciler would append the node's actual children
    // (the callout's text paragraphs) directly into the root div returned by createDOM - as
    // siblings of the icon span, not inside .callout-content where they visually belong.
    // Redirecting the slot to .callout-content is what makes the icon+content layout work.
    getDOMSlot(element: HTMLElement): ElementDOMSlot<HTMLElement> {
        const contentDiv = element.querySelector<HTMLElement>('.callout-content') ?? element;
        return super.getDOMSlot(element).withElement(contentDiv);
    }

    updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
        const theme = config.theme.callout as Record<string, string> | undefined;

        if (prevNode.__color !== this.__color) {
            if (theme?.[prevNode.__color]) dom.classList.remove(...theme[prevNode.__color].split(' ').filter(Boolean));
            if (theme?.[this.__color]) dom.classList.add(...theme[this.__color].split(' ').filter(Boolean));
        }

        if (prevNode.__icon !== this.__icon) {
            const iconSpan = dom.querySelector<HTMLElement>('.callout-icon');
            if (iconSpan) iconSpan.textContent = this.__icon;
        }

        return false;
    }

    static importJSON(serializedNode: SerializedCalloutNode): CalloutNode {
        const node = $createCalloutNode(serializedNode.icon, serializedNode.color);
        node.setFormat(serializedNode.format);
        node.setIndent(serializedNode.indent);
        node.setDirection(serializedNode.direction);
        return node;
    }

    exportJSON(): SerializedCalloutNode {
        return {
            ...super.exportJSON(),
            type: 'callout',
            version: 1,
            icon: this.__icon,
            color: this.__color,
        };
    }

    insertNewAfter(_selection: RangeSelection, restoreSelection = true): ParagraphNode {
        const paragraph = $createParagraphNode();
        this.insertAfter(paragraph, restoreSelection);
        return paragraph;
    }

    // Mirrors QuoteNode's real collapseAtStart: unwrap into a plain paragraph rather than
    // swallowing the Backspace keystroke with no effect (returning `true` alone tells Lexical
    // "the collapse was handled" - it must actually perform a transform, or the keypress becomes
    // a silent no-op with no way to un-callout a block).
    collapseAtStart(): boolean {
        const paragraph = $createParagraphNode();
        this.getChildren().forEach((child) => paragraph.append(child));
        this.replace(paragraph);
        return true;
    }

    canMergeWhenEmpty(): boolean {
        return true;
    }
}

export function $createCalloutNode(icon: string = DEFAULT_ICON, color: CalloutColor = DEFAULT_COLOR): CalloutNode {
    return $applyNodeReplacement(new CalloutNode(icon, color));
}

export function $isCalloutNode(node: LexicalNode | null | undefined): node is CalloutNode {
    return node instanceof CalloutNode;
}
