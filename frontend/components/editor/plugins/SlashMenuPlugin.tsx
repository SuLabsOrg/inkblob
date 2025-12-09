import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
    LexicalTypeaheadMenuPlugin,
    MenuOption,
    useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { TextNode } from 'lexical';
import { useCallback, useState, useMemo } from 'react';
import * as React from 'react';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode';
import { $createCodeNode } from '@lexical/code';
import { $setBlocksType } from '@lexical/selection';
import { $createParagraphNode, $getSelection, $isRangeSelection } from 'lexical';
import { INSERT_TABLE_COMMAND } from '@lexical/table';
import {
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    Code,
    Minus,
    Type,
    Table,
} from 'lucide-react';

class SlashMenuOption extends MenuOption {
    title: string;
    icon: React.ReactNode;
    keywords: Array<string>;
    keyboardShortcut?: string;
    onSelect: (editor: any) => void;

    constructor(
        title: string,
        options: {
            icon?: React.ReactNode;
            keywords?: Array<string>;
            keyboardShortcut?: string;
            onSelect: (editor: any) => void;
        },
    ) {
        super(title);
        this.title = title;
        this.keywords = options.keywords || [];
        this.icon = options.icon;
        this.keyboardShortcut = options.keyboardShortcut;
        this.onSelect = options.onSelect;
    }
}

interface SlashMenuItemProps {
    index: number;
    isSelected: boolean;
    onClick: () => void;
    onMouseEnter: () => void;
    option: SlashMenuOption;
}

const SlashMenuItem: React.FC<SlashMenuItemProps> = ({
    index,
    isSelected,
    onClick,
    onMouseEnter,
    option,
}) => {
    return (
        <li
            tabIndex={-1}
            className={`cursor-pointer flex items-center gap-3 px-3 py-2 text-sm outline-none transition-colors ${isSelected ? 'bg-web3-cardHover text-web3-primary' : 'text-web3-text'
                }`}
            ref={option.setRefElement}
            role="option"
            aria-selected={isSelected}
            id={'typeahead-item-' + index}
            onMouseEnter={onMouseEnter}
            onClick={onClick}
        >
            <div className={`flex items-center justify-center h-8 w-8 rounded border ${isSelected ? 'bg-web3-primary/10 border-web3-primary/20 text-web3-primary' : 'bg-web3-card border-web3-border text-web3-textMuted'
                }`}>
                {option.icon}
            </div>
            <div className="flex flex-col">
                <span className="font-medium">{option.title}</span>
            </div>
        </li>
    );
}

const SlashMenuPopover = ({
    anchorElementRef,
    children
}: {
    anchorElementRef: React.MutableRefObject<HTMLElement | null>;
    children: React.ReactNode;
}) => {
    const [position, setPosition] = useState({ top: 0, left: 0 });

    React.useEffect(() => {
        const updatePosition = () => {
            if (!anchorElementRef.current) return;
            const rect = anchorElementRef.current.getBoundingClientRect();
            // Basic positioning: below the cursor
            setPosition({
                top: rect.bottom + 5,
                left: rect.left
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [anchorElementRef]);

    if (!anchorElementRef.current) return null;

    return createPortal(
        <div
            className="fixed z-50 min-w-[280px] max-h-[320px] overflow-y-auto rounded-lg border border-web3-border bg-web3-card shadow-xl animate-in fade-in zoom-in-95 duration-100 p-1 custom-scrollbar"
            style={{ top: position.top, left: position.left }}
        >
            {children}
        </div>,
        document.body
    );
};

export default function SlashMenuPlugin() {
    const [editor] = useLexicalComposerContext();
    const [queryString, setQueryString] = useState<string | null>(null);

    const checkForSlashTrigger = useBasicTypeaheadTriggerMatch('/', {
        minLength: 0,
    });

    const options = useMemo(() => {
        return [
            new SlashMenuOption('Text', {
                icon: <Type size={18} />,
                keywords: ['paragraph', 'text', 'p'],
                onSelect: (editor) => {
                    editor.update(() => {
                        const selection = $getSelection();
                        if ($isRangeSelection(selection)) {
                            $setBlocksType(selection, () => $createParagraphNode());
                        }
                    });
                },
            }),
            new SlashMenuOption('Heading 1', {
                icon: <Heading1 size={18} />,
                keywords: ['h1', 'heading', 'title', 'big'],
                onSelect: (editor) => {
                    editor.update(() => {
                        const selection = $getSelection();
                        if ($isRangeSelection(selection)) {
                            $setBlocksType(selection, () => $createHeadingNode('h1'));
                        }
                    });
                },
            }),
            new SlashMenuOption('Heading 2', {
                icon: <Heading2 size={18} />,
                keywords: ['h2', 'heading', 'subtitle', 'medium'],
                onSelect: (editor) => {
                    editor.update(() => {
                        const selection = $getSelection();
                        if ($isRangeSelection(selection)) {
                            $setBlocksType(selection, () => $createHeadingNode('h2'));
                        }
                    });
                },
            }),
            new SlashMenuOption('Heading 3', {
                icon: <Heading3 size={18} />,
                keywords: ['h3', 'heading', 'small'],
                onSelect: (editor) => {
                    editor.update(() => {
                        const selection = $getSelection();
                        if ($isRangeSelection(selection)) {
                            $setBlocksType(selection, () => $createHeadingNode('h3'));
                        }
                    });
                },
            }),
            new SlashMenuOption('Bullet List', {
                icon: <List size={18} />,
                keywords: ['ul', 'list', 'bullet', 'point'],
                onSelect: (editor) => {
                    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
                },
            }),
            new SlashMenuOption('Numbered List', {
                icon: <ListOrdered size={18} />,
                keywords: ['ol', 'list', 'number', 'ordered'],
                onSelect: (editor) => {
                    editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
                },
            }),
            new SlashMenuOption('Quote', {
                icon: <Quote size={18} />,
                keywords: ['quote', 'blockquote', 'citation'],
                onSelect: (editor) => {
                    editor.update(() => {
                        const selection = $getSelection();
                        if ($isRangeSelection(selection)) {
                            $setBlocksType(selection, () => $createQuoteNode());
                        }
                    });
                },
            }),
            new SlashMenuOption('Code Block', {
                icon: <Code size={18} />,
                keywords: ['code', 'block', 'snippet'],
                onSelect: (editor) => {
                    editor.update(() => {
                        const selection = $getSelection();
                        if ($isRangeSelection(selection)) {
                            $setBlocksType(selection, () => $createCodeNode());
                        }
                    });
                },
            }),
            new SlashMenuOption('Divider', {
                icon: <Minus size={18} />,
                keywords: ['divider', 'hr', 'line', 'separator'],
                onSelect: (editor) => {
                    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
                },
            }),
            new SlashMenuOption('Table', {
                icon: <Table size={18} />,
                keywords: ['table', 'grid', 'spreadsheet'],
                onSelect: (editor) => {
                    editor.dispatchCommand(INSERT_TABLE_COMMAND, { columns: '3', rows: '3' });
                },
            }),
        ];
    }, []);

    const onSelectOption = useCallback(
        (
            selectedOption: SlashMenuOption,
            nodeToRemove: TextNode | null,
            closeMenu: () => void,
            matchingString: string,
        ) => {
            editor.update(() => {
                if (nodeToRemove) {
                    nodeToRemove.remove();
                }
                selectedOption.onSelect(editor);
                closeMenu();
            });
        },
        [editor],
    );

    return (
        <LexicalTypeaheadMenuPlugin<SlashMenuOption>
            onQueryChange={setQueryString}
            onSelectOption={onSelectOption}
            triggerFn={checkForSlashTrigger}
            options={options}
            menuRenderFn={(
                anchorElementRef,
                { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
            ) => {
                if (anchorElementRef.current && options.length
                    && queryString !== null) {
                    return (
                        <SlashMenuPopover anchorElementRef={anchorElementRef}>
                            <div className="px-3 py-2 text-xs font-semibold text-web3-textMuted uppercase tracking-wider">
                                Basic Blocks
                            </div>
                            <ul>
                                {options.map((option, i) => (
                                    <SlashMenuItem
                                        key={i}
                                        index={i}
                                        isSelected={selectedIndex === i}
                                        onClick={() => {
                                            setHighlightedIndex(i);
                                            selectOptionAndCleanUp(option);
                                        }}
                                        onMouseEnter={() => {
                                            setHighlightedIndex(i);
                                        }}
                                        option={option}
                                    />
                                ))}
                            </ul>
                        </SlashMenuPopover>
                    );
                }
                return null;
            }}
        />
    );
}
