import React, { useEffect, useState } from 'react';
import { Note } from '../types';
import { Type, Bold, Italic, Underline, CheckSquare, Share, Trash, PenLine, Save } from 'lucide-react';
import { useNoteContent } from '../hooks/useNoteContent';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { EditorState, FORMAT_TEXT_COMMAND } from 'lexical';

interface EditorProps {
  note: Note | null;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onSave: (id: string) => Promise<void>;
  onDeleteNote: (id: string) => void;
  onCreateNote: () => void;
}

// Simple ErrorBoundary component
class SimpleErrorBoundary extends React.Component<{ children: React.ReactNode }> {
  componentDidCatch(error: Error) {
    console.error('Lexical Error:', error);
  }
  render() {
    return this.props.children;
  }
}

const theme = {
  paragraph: 'mb-2 text-web3-text/90 text-lg leading-relaxed',
  text: {
    bold: 'font-bold text-web3-primary',
    italic: 'italic text-web3-accent',
    underline: 'underline decoration-web3-primary/50',
  },
};

function onError(error: Error) {
  console.error(error);
}

// Toolbar Component
const ToolbarPlugin = () => {
  const [editor] = useLexicalComposerContext();

  const format = (formatType: 'bold' | 'italic' | 'underline') => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, formatType);
  };

  return (
    <div className="flex items-center gap-2 text-web3-textMuted">
      <button
        onClick={() => format('bold')}
        className="hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all"
        title="Bold"
      >
        <Bold size={16} />
      </button>
      <button
        onClick={() => format('italic')}
        className="hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all"
        title="Italic"
      >
        <Italic size={16} />
      </button>
      <button
        onClick={() => format('underline')}
        className="hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all"
        title="Underline"
      >
        <Underline size={16} />
      </button>
      <div className="h-4 w-[1px] bg-web3-border mx-2"></div>
      <button className="hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all"><CheckSquare size={16} /></button>
    </div>
  );
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
    theme,
    onError,
    editorState: noteContent || null, // Use loaded content as initial state
  };

  useEffect(() => {
    if (note) {
      setLocalTitle(note.title);
    } else {
      setLocalTitle('');
    }
  }, [note]);

  // Log content loading status
  useEffect(() => {
    if (note?.blobId) {
      console.debug('[Editor] Content loading status:', {
        blobId: note.blobId,
        isLoading: isContentLoading,
        hasError: !!contentError,
        contentLength: noteContent?.length || 0,
        error: contentError?.message
      });
    }
  }, [note?.blobId, isContentLoading, contentError, noteContent?.length]);

  const handleSave = async () => {
    console.log('[Editor] handleSave called for note:', note?.id);
    console.log('[Editor] handleSave timestamp:', Date.now());
    console.log('[Editor] handleSave isSaving state:', isSaving);

    if (!note) return;
    if (isSaving) {
      console.log('[Editor] Already saving, skipping...');
      return;
    }

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
      <div className="flex-1 h-full flex flex-col backdrop-blur-sm bg-web3-card/10">
        <div className="h-12 border-b border-web3-border/50 flex items-center justify-between px-6 bg-web3-card/20">
          <ToolbarPlugin />
          <div className="flex items-center gap-2 text-web3-textMuted">
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

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
          <div className="flex-1">
            <div className="max-w-3xl mx-auto pt-8 px-8 pb-8">
              <div className="text-center text-xs text-web3-textMuted/60 mb-8 font-medium tracking-widest uppercase">
                {formattedDate}
              </div>

              <textarea
                value={localTitle}
                onChange={handleTitleChange}
                placeholder="Title"
                rows={1}
                className="w-full text-4xl font-bold text-web3-text placeholder-web3-textMuted/30 resize-none border-none focus:ring-0 p-0 bg-transparent leading-tight mb-6 text-glow"
                style={{ minHeight: '48px', overflow: 'hidden' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = target.scrollHeight + 'px';
                }}
              />

              <div className="relative min-h-[500px]">
                <RichTextPlugin
                  contentEditable={<ContentEditable className="outline-none min-h-[500px] text-lg text-web3-text/90" />}
                  placeholder={<div className="absolute top-0 left-0 text-web3-textMuted/30 pointer-events-none text-lg">Start typing...</div>}
                  ErrorBoundary={SimpleErrorBoundary}
                />
                <HistoryPlugin />
                <OnChangePlugin onChange={handleEditorChange} />
              </div>
            </div>
          </div>

          {/* Bottom Toolbar */}
          <div className="h-12 border-t border-web3-border/50 flex items-center justify-end px-6 bg-web3-card/20">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all flex items-center gap-2 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Save Note"
            >
              <Save size={16} className={isSaving ? 'animate-pulse' : ''} />
              <span className="text-sm">{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>
      </div>
    </LexicalComposer>
  );
};