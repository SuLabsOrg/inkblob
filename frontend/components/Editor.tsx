import React, { useEffect, useState, Component } from 'react';
import { Note } from '../types';
import { Trash, PenLine, Save, Share } from 'lucide-react';
import { useNoteContent } from '../hooks/useNoteContent';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { EditorState, $getRoot, $createParagraphNode, $createTextNode } from 'lexical';

import { EditorNodes } from './editor/nodes';
import { EditorTheme } from './editor/theme';
import SlashMenuPlugin from './editor/plugins/SlashMenuPlugin';
import FloatingToolbarPlugin from './editor/plugins/FloatingToolbarPlugin';

interface EditorProps {
  note: Note | null;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onSave: (id: string) => Promise<void>;
  onDeleteNote: (id: string) => void;
  onCreateNote: () => void;
}

// Simple ErrorBoundary component
interface SimpleErrorBoundaryProps {
  children: React.ReactElement;
  onError: (error: Error) => void;
}

interface SimpleErrorBoundaryState {
  hasError: boolean;
}

class SimpleErrorBoundary extends Component<SimpleErrorBoundaryProps, SimpleErrorBoundaryState> {
  state: SimpleErrorBoundaryState = { hasError: false };
  props: SimpleErrorBoundaryProps;

  constructor(props: SimpleErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Lexical Error:', error);
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border border-red-500/20 bg-red-500/10 rounded-lg text-red-500">
          <p className="font-medium">Something went wrong in the editor.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function onError(error: Error) {
  console.error(error);
}

// Plugin to synchronize editor state when content loads asynchronously
const EditorStateSynchronizer: React.FC<{ content: string | null | undefined; isLoading: boolean; hasValidBlobId: boolean }> = ({ content, isLoading, hasValidBlobId }) => {
  const [editor] = useLexicalComposerContext();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // For NEW notes (no blobId), isLoading will be false and content undefined.
    // We should initialize immediately with empty content.
    // For EXISTING notes, wait for loading to finish.
    if (hasValidBlobId && isLoading) return;
    if (isInitialized) return;

    // If content is null/undefined after loading (or for new notes), treat as empty string
    const safeContent = content || '';

    try {
      if (safeContent.trim().startsWith('{')) {
        // Attempt to parse as JSON (new format)
        const state = editor.parseEditorState(safeContent);
        editor.setEditorState(state);
      } else {
        throw new Error('Not JSON');
      }
    } catch (e) {
      // Fallback for legacy text OR empty new note
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        // If it's legacy text, insert it. If empty string, just empty paragraph.
        if (safeContent) {
          const text = $createTextNode(safeContent);
          paragraph.append(text);
        }
        root.append(paragraph);
      });
    }
    setIsInitialized(true);
  }, [content, isLoading, hasValidBlobId, editor, isInitialized]);

  return null;
};

export const Editor: React.FC<EditorProps> = ({
  note,
  onUpdateNote,
  onSave,
  onDeleteNote,
  onCreateNote
}) => {
  const [localTitle, setLocalTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load note content from Walrus
  const { data: noteContent, isLoading: isContentLoading, error: contentError } = useNoteContent(note?.blobId);

  const initialConfig = {
    namespace: 'InkBlobEditor',
    theme: EditorTheme,
    nodes: EditorNodes,
    onError,
    // Let EditorStateSynchronizer handle content loading to avoid stale closure issues
    editorState: null,
  };

  useEffect(() => {
    if (note) {
      setLocalTitle(note.title);
    } else {
      setLocalTitle('');
    }
  }, [note]);

  const handleSave = async () => {
    if (!note) return;
    if (isSaving) return;

    setIsSaving(true);
    try {
      await onSave(note.id);
    } finally {
      setIsSaving(false);
    }
  };

  // Show loading indicator while content is loading
  if (note && isContentLoading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center text-web3-textMuted flex-col gap-4 backdrop-blur-sm">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-web3-primary"></div>
        <p className="font-medium text-lg">Loading note content...</p>
        <p className="text-sm opacity-70">Decrypting from Walrus storage</p>
      </div>
    );
  }

  // Show error if content loading fails
  if (note && contentError) {
    return (
      <div className="flex-1 h-full flex items-center justify-center text-web3-textMuted flex-col gap-4 backdrop-blur-sm">
        <div className="p-6 rounded-full bg-red-500/10 border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
          <Trash size={48} strokeWidth={1} className="text-red-400" />
        </div>
        <p className="font-medium text-lg">Failed to load note content</p>
        <p className="text-sm opacity-70 text-center max-w-md">
          {contentError.message || 'Unable to decrypt note from Walrus storage'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-web3-primary text-white rounded-lg hover:bg-web3-primary/80 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex-1 h-full flex items-center justify-center text-web3-textMuted flex-col gap-4 backdrop-blur-sm">
        <div className="p-6 rounded-full bg-web3-card border border-web3-border shadow-[0_0_30px_rgba(139,92,246,0.1)]">
          <PenLine size={48} strokeWidth={1} className="text-web3-primary" />
        </div>
        <p className="font-medium text-lg">Select a note to view</p>
        <button
          onClick={onCreateNote}
          className="mt-2 px-6 py-2 rounded-full bg-web3-primary/10 text-web3-primary hover:bg-web3-primary/20 transition-all border border-web3-primary/20 hover:shadow-[0_0_15px_rgba(139,92,246,0.3)]"
        >
          Create a new note
        </button>
      </div>
    );
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalTitle(newVal);
    onUpdateNote(note.id, { title: newVal, updatedAt: new Date() });
  };

  const handleEditorChange = (editorState: EditorState) => {
    editorState.read(() => {
      const json = JSON.stringify(editorState);
      onUpdateNote(note.id, { content: json, updatedAt: new Date() });
    });
  };

  const formattedDate = note.updatedAt.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  return (
    <LexicalComposer initialConfig={initialConfig} key={note.id}>
      <div className="flex-1 h-full flex flex-col backdrop-blur-sm bg-web3-card/10 relative">
        {/* Top Bar - Minimalist */}
        <div className="h-12 flex items-center justify-between px-6 bg-transparent z-10">
          <div className="text-xs text-web3-textMuted/60 font-medium tracking-widest uppercase">
            {/* Breadcrumbs or status could go here */}
          </div>
          <div className="flex items-center gap-2 text-web3-textMuted">
            <span className="text-xs mr-2 opacity-50">
              {isSaving ? 'Saving...' : 'Saved'}
            </span>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Save Note"
            >
              <Save size={16} className={isSaving ? 'animate-pulse' : ''} />
            </button>
            <div className="h-4 w-[1px] bg-web3-border mx-2"></div>
            <button
              onClick={() => onDeleteNote(note.id)}
              className="hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-md transition-all"
              title="Delete Note"
            >
              <Trash size={16} />
            </button>
            <button className="hover:text-web3-accent hover:bg-web3-accent/10 p-1.5 rounded-md transition-all">
              <Share size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
          <div className="flex-1">
            <div className="max-w-3xl mx-auto pt-12 px-12 pb-24">

              {/* Cover Image Placeholder (Future) */}
              <div className="group relative mb-8 opacity-0 hover:opacity-100 transition-opacity h-6 -mt-6">
                <button className="text-xs text-web3-textMuted hover:text-web3-text flex items-center gap-1">
                  + Add cover
                </button>
              </div>

              {/* Icon Placeholder (Future) */}
              <div className="group relative mb-4 opacity-0 hover:opacity-100 transition-opacity h-6">
                <button className="text-xs text-web3-textMuted hover:text-web3-text flex items-center gap-1">
                  + Add icon
                </button>
              </div>

              <textarea
                value={localTitle}
                onChange={handleTitleChange}
                placeholder="Untitled"
                rows={1}
                className="w-full text-5xl font-bold text-web3-text placeholder-web3-textMuted/20 resize-none border-none focus:ring-0 p-0 bg-transparent leading-tight mb-4 transition-all"
                style={{ minHeight: '60px', overflow: 'hidden' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = target.scrollHeight + 'px';
                }}
              />

              <div className="text-xs text-web3-textMuted/60 mb-8 font-medium tracking-widest uppercase flex items-center gap-2">
                <span>{formattedDate}</span>
                <span>•</span>
                <span>{note.content.length} chars</span>
              </div>

              <div className="relative min-h-[500px]">
                <RichTextPlugin
                  contentEditable={<ContentEditable className="outline-none min-h-[500px] text-lg text-web3-text/90" />}
                  placeholder={<div className="absolute top-0 left-0 text-web3-textMuted/20 pointer-events-none text-lg select-none">Type '/' for commands...</div>}
                  ErrorBoundary={SimpleErrorBoundary}
                />
                <HistoryPlugin />
                <ListPlugin />
                <LinkPlugin />
                <HorizontalRulePlugin />
                <TablePlugin />
                <MarkdownShortcutPlugin transformers={[]} /> {/* Default transformers */}
                <OnChangePlugin onChange={handleEditorChange} />
                <SlashMenuPlugin />
                <FloatingToolbarPlugin />
                <EditorStateSynchronizer content={noteContent} isLoading={isContentLoading} hasValidBlobId={!!(note?.blobId && note.blobId.length > 10 && note.blobId !== 'temp_blob_id')} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </LexicalComposer>
  );
};