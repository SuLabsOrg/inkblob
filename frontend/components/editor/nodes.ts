import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { MarkNode } from '@lexical/mark';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import { TableNode, TableCellNode, TableRowNode } from '@lexical/table';
import { CalloutNode } from './nodes/CalloutNode';
import { CollapsibleContainerNode, CollapsibleContentNode, CollapsibleTitleNode } from './nodes/CollapsibleNode';

export const EditorNodes = [
    HeadingNode,
    ListNode,
    ListItemNode,
    QuoteNode,
    CodeNode,
    CodeHighlightNode,
    AutoLinkNode,
    LinkNode,
    MarkNode,
    HorizontalRuleNode,
    TableNode,
    TableCellNode,
    TableRowNode,
    CalloutNode,
    CollapsibleContainerNode,
    CollapsibleTitleNode,
    CollapsibleContentNode,
];
