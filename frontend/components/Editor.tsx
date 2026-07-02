import React, { useEffect, useMemo, useState, Component } from 'react';
import { ChevronLeft, ChevronRight, Eye, FileText, Folder as FolderIcon, Plus, RotateCcw } from 'lucide-react';
import { Folder, Note } from '../types';
import { Trash, PenLine, Save, Share } from 'lucide-react';
import { NOTE_DELETE_ENABLED, NOTE_DELETE_DISABLED_REASON } from '../config/featureFlags';
import { useAutosave } from '../hooks/useAutosave';
import { useNoteContent } from '../hooks/useNoteContent';
import { getAncestorChain } from '../utils/folderTree';
import { getAncestorNoteChain } from '../utils/noteTree';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { EditorState, $getRoot, $createParagraphNode, $createTextNode } from 'lexical';

import { EditorNodes } from './editor/nodes';
import { EditorTheme } from './editor/theme';
import SlashMenuPlugin from './editor/plugins/SlashMenuPlugin';
import FloatingToolbarPlugin from './editor/plugins/FloatingToolbarPlugin';
import DuplicateBlockPlugin from './editor/plugins/DuplicateBlockPlugin';
import DragHandlePlugin from './editor/plugins/DragHandlePlugin';
import { SaveResult } from '../hooks/useAutosave';
import { ShareModal } from './ShareModal';

interface EditorProps {
  note: Note | null;
  /** Full flat note list, needed to walk the current note's parent-note ancestor chain for
   * breadcrumbs (see getAncestorNoteChain) - a superset of childNotes' source data. */
  notes: Note[];
  folders: Folder[];
  /** Live (non-deleted) notes whose parentNoteId is the current note's id, for the "Sub-pages"
   * section rendered below the main content. Computed by the caller (App.tsx) via useMemo. */
  childNotes: Note[];
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onSave: (id: string, options?: { silent?: boolean }) => Promise<SaveResult>;
  onDeleteNote: (id: string) => void;
  onRestoreNote?: (id: string) => void;
  onCreateNote: () => void;
  /** Creates a new note nested under parentNoteId and navigates to it ("+ New sub-page" row). */
  onCreateSubNote: (parentNoteId: string) => void;
  onNavigateToFolder: (folderId: string) => void;
  /** Navigates to another note by id (sub-page row click, or a note-crumb in the breadcrumb bar). */
  onNavigateToNote: (noteId: string) => void;
  onDirtyChange?: (noteId: string, isDirty: boolean) => void;
  /** Mobile-only: returns to the note list pane (the two panes share screen width below the md breakpoint). */
  onBack?: () => void;
  /** The active notebook's on-chain object id, needed by the Share button to open ShareModal.
   *  Null while the notebook hasn't loaded/initialized yet - the Share button is disabled in that
   *  case. Deliberately passed as null in shared mode too (the Share button is hidden there). */
  notebookId?: string | null;
  /** True when viewing a shared notebook with a READ-only grant: the Lexical editor is mounted
   *  non-editable with every edit affordance (slash menu, toolbar, drag handles, save/delete)
   *  removed. Default false = all existing behavior. */
  readOnly?: boolean;
  /** True when viewing a shared notebook at EITHER permission level: autosave is disabled
   *  (every save is plain-wallet-signed - a debounced autosave would spam wallet popups; the
   *  Save button becomes the only save path) and the owner-only Share button/ShareModal are
   *  hidden. Default false = all existing behavior. */
  isSharedMode?: boolean;
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
  notes,
  folders,
  childNotes,
  onUpdateNote,
  onSave,
  onDeleteNote,
  onRestoreNote,
  onCreateNote,
  onCreateSubNote,
  onNavigateToFolder,
  onNavigateToNote,
  onDirtyChange,
  onBack,
  notebookId,
  readOnly = false,
  isSharedMode = false
}) => {
  const [localTitle, setLocalTitle] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  // DragHandlePlugin needs the actual DOM node (not a ref object) to anchor its portal to -
  // captured via a callback ref so it's available once the editor content div mounts.
  const [dragHandleAnchor, setDragHandleAnchor] = useState<HTMLDivElement | null>(null);

  // Load note content from Walrus
  const { data: noteContent, isLoading: isContentLoading, error: contentError } = useNoteContent(note?.blobId);

  const { isSaving, isDirty, saveNow } = useAutosave({
    noteId: note?.id ?? '',
    content: note?.content ?? '',
    title: note?.title ?? '',
    onSave,
    onDirtyChange,
    // Shared notebooks (both permissions): no automatic saves - every save is wallet-signed, so
    // a debounce-triggered autosave would pop 1-3 wallet approval dialogs per cycle. Dirty
    // tracking stays on (status text + beforeunload warning); the Save button (saveNow) is the
    // only save path. See useAutosave's `enabled` doc comment.
    enabled: !isSharedMode,
  });

  // Interleaved breadcrumb trail, outermost-to-innermost (matching the existing folder-only
  // breadcrumbs' root-to-leaf order): folder-ancestor crumbs for whichever note sits at the ROOT
  // of the note-ancestor chain, followed by the note-ancestor crumbs (this page's chain of parent
  // pages) themselves. The root-of-chain page is what's actually "in" the folder structurally, not
  // the current (possibly nested) note, since a sub-page's own folderId is just inherited/orthogonal
  // metadata rather than where it lives in the folder tree (see canNestNoteUnder's doc and the
  // parentNoteId/folderId orthogonality decision this feature is built on).
  type Breadcrumb =
    | { kind: 'note'; id: string; label: string }
    | { kind: 'folder'; id: string; label: string };

  const breadcrumbs = useMemo((): Breadcrumb[] => {
    if (!note) return [];

    const noteChain = note.parentNoteId ? getAncestorNoteChain(notes, note.id) : [];
    const rootNote = noteChain.length > 0 ? noteChain[0] : note;

    const noteCrumbs: Breadcrumb[] = noteChain
      .slice(0, -1) // exclude the current note itself - only its ancestors are breadcrumbs
      .map(n => ({ kind: 'note' as const, id: n.id, label: n.title || 'Untitled' }));

    const folderCrumbs: Breadcrumb[] = rootNote.folderId
      ? getAncestorChain(folders, rootNote.folderId).map(f => ({ kind: 'folder' as const, id: f.id, label: f.name }))
      : [];

    return [...folderCrumbs, ...noteCrumbs];
  }, [folders, notes, note]);

  const initialConfig = {
    namespace: 'InkBlobEditor',
    theme: EditorTheme,
    nodes: EditorNodes,
    onError,
    // Let EditorStateSynchronizer handle content loading to avoid stale closure issues
    editorState: null,
    // Read-only shared mode: the ContentEditable is inert (EditorStateSynchronizer's
    // editor.update/setEditorState still work - editable:false only blocks user input).
    editable: !readOnly,
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
    await saveNow();
  };

  // Show loading indicator while content is loading
  if (note && isContentLoading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center text-web3-textMuted flex-col gap-4 backdrop-blur-sm relative">
        <button
          onClick={onBack}
          title="Back to notes"
          aria-label="Back to notes"
          className="md:hidden absolute top-3 left-3 p-1.5 rounded-md hover:bg-web3-cardHover hover:text-web3-text transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-web3-primary"></div>
        <p className="font-medium text-lg">Loading note content...</p>
        <p className="text-sm opacity-70">Decrypting from Walrus storage</p>
      </div>
    );
  }

  // Show error if content loading fails
  if (note && contentError) {
    return (
      <div className="flex-1 h-full flex items-center justify-center text-web3-textMuted flex-col gap-4 backdrop-blur-sm relative">
        <button
          onClick={onBack}
          title="Back to notes"
          aria-label="Back to notes"
          className="md:hidden absolute top-3 left-3 p-1.5 rounded-md hover:bg-web3-cardHover hover:text-web3-text transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
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
      <div className="flex-1 h-full flex items-center justify-center text-web3-textMuted flex-col gap-4 backdrop-blur-sm relative">
        <button
          onClick={onBack}
          title="Back to notes"
          aria-label="Back to notes"
          className="md:hidden absolute top-3 left-3 p-1.5 rounded-md hover:bg-web3-cardHover hover:text-web3-text transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="p-6 rounded-full bg-web3-card border border-web3-border shadow-[0_0_30px_rgba(139,92,246,0.1)]">
          <PenLine size={48} strokeWidth={1} className="text-web3-primary" />
        </div>
        <p className="font-medium text-lg">Select a note to view</p>
        {!readOnly && (
          <button
            onClick={onCreateNote}
            className="mt-2 px-6 py-2 rounded-full bg-web3-primary/10 text-web3-primary hover:bg-web3-primary/20 transition-all border border-web3-primary/20 hover:shadow-[0_0_15px_rgba(139,92,246,0.3)]"
          >
            Create a new note
          </button>
        )}
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
        <div className="h-12 flex items-center justify-between px-2 md:px-6 bg-transparent z-10">
          <div className="flex items-center gap-1 text-xs text-web3-textMuted/70 font-medium min-w-0 overflow-hidden">
            <button
              onClick={onBack}
              title="Back to notes"
              aria-label="Back to notes"
              className="md:hidden shrink-0 p-1.5 -ml-1 mr-1 rounded-md hover:bg-web3-cardHover hover:text-web3-text transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={`${crumb.kind}-${crumb.id}`}>
                {i > 0 && <ChevronRight size={12} className="opacity-50 shrink-0" />}
                <button
                  onClick={() => crumb.kind === 'folder' ? onNavigateToFolder(crumb.id) : onNavigateToNote(crumb.id)}
                  className="flex items-center gap-1 hover:text-web3-text transition-colors truncate max-w-[10rem]"
                >
                  {crumb.kind === 'folder'
                    ? <FolderIcon size={11} className="shrink-0 opacity-60" />
                    : <FileText size={11} className="shrink-0 opacity-60" />}
                  {crumb.label}
                </button>
              </React.Fragment>
            ))}
          </div>
          <div className="flex items-center gap-2 text-web3-textMuted">
            {readOnly ? (
              // Read-only shared mode: no save/delete/restore affordances at all - just an
              // always-visible chip making the mode obvious from within the editor itself.
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-yellow-500/40 bg-yellow-500/10 text-yellow-300">
                <Eye size={11} />
                Read-only
              </span>
            ) : (
              <>
                <span className="text-xs mr-2 opacity-50">
                  {isSaving
                    ? 'Saving...'
                    : isDirty
                      ? (isSharedMode ? 'Unsaved changes — autosave off, use Save' : 'Unsaved changes')
                      : 'Saved'}
                </span>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Save Note"
                  aria-label="Save note"
                >
                  <Save size={16} className={isSaving ? 'animate-pulse' : ''} />
                </button>
                <div className="h-4 w-[1px] bg-web3-border mx-2"></div>
                {note.isDeleted ? (
                  <button
                    onClick={() => onRestoreNote?.(note.id)}
                    className="hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all"
                    title="Restore Note"
                    aria-label="Restore note"
                  >
                    <RotateCcw size={16} />
                  </button>
                ) : (
                  <button
                    disabled={!NOTE_DELETE_ENABLED}
                    onClick={NOTE_DELETE_ENABLED ? () => onDeleteNote(note.id) : undefined}
                    className={NOTE_DELETE_ENABLED
                      ? 'hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-md transition-all'
                      : 'opacity-30 cursor-not-allowed p-1.5 rounded-md'}
                    title={NOTE_DELETE_ENABLED ? 'Move to Trash' : NOTE_DELETE_DISABLED_REASON}
                    aria-label="Move note to Trash"
                  >
                    <Trash size={16} />
                  </button>
                )}
              </>
            )}
            {/* Share (grant/revoke access) is owner-only on-chain - hidden in BOTH shared modes. */}
            {!isSharedMode && (
              <button
                onClick={() => setIsShareModalOpen(true)}
                disabled={!notebookId}
                className={`hover:text-web3-accent hover:bg-web3-accent/10 p-1.5 rounded-md transition-all ${!notebookId ? 'opacity-30 cursor-not-allowed' : ''}`}
                title={notebookId ? 'Share Notebook Access' : 'Notebook not ready yet'}
                aria-label="Share notebook access"
              >
                <Share size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
          <div className="flex-1">
            <div className="max-w-3xl mx-auto pt-12 px-12 pb-24">

              <textarea
                value={localTitle}
                onChange={readOnly ? () => undefined : handleTitleChange}
                readOnly={readOnly}
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

              <div className="relative min-h-[500px]" ref={setDragHandleAnchor}>
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
                <TabIndentationPlugin />
                {/* Edit affordances - not mounted at all in read-only shared mode (an
                    editable:false editor must not offer slash menu/toolbars/drag handles, and
                    OnChangePlugin would only propagate programmatic loads back into note state). */}
                {!readOnly && (
                  <>
                    <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                    <OnChangePlugin onChange={handleEditorChange} />
                    <SlashMenuPlugin />
                    <FloatingToolbarPlugin />
                    <DuplicateBlockPlugin />
                    {dragHandleAnchor && <DragHandlePlugin anchorElem={dragHandleAnchor} />}
                  </>
                )}
                <EditorStateSynchronizer content={noteContent} isLoading={isContentLoading} hasValidBlobId={!!(note?.blobId && note.blobId.length > 10 && note.blobId !== 'temp_blob_id')} />
              </div>

              {/* Sub-pages - deliberately a plain list section rather than an inline Lexical
                  decorator node/block (see this feature's scope decision doc): notes whose
                  parentNoteId is this note's id, plus a row to create a new one. */}
              <div className="mt-12 pt-6 border-t border-web3-border/50">
                <h3 className="text-xs font-semibold text-web3-textMuted/70 uppercase tracking-widest mb-3">
                  Sub-pages
                </h3>
                <div className="flex flex-col gap-1.5">
                  {childNotes.map(child => (
                    <button
                      key={child.id}
                      onClick={() => onNavigateToNote(child.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-web3-card/40 border border-web3-border/50 hover:bg-web3-cardHover hover:border-web3-primary/30 transition-all text-left"
                    >
                      <FileText size={14} className="shrink-0 text-web3-textMuted/70" />
                      <span className="flex-1 truncate text-sm text-web3-text">{child.title || 'Untitled'}</span>
                      <ChevronRight size={14} className="shrink-0 opacity-40" />
                    </button>
                  ))}
                  {/* Sub-page LIST above stays in read-only mode (pure navigation); only the
                      create row is a mutation and gets hidden. */}
                  {!readOnly && (
                    <button
                      onClick={() => onCreateSubNote(note.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-web3-border/50 hover:bg-web3-cardHover hover:border-web3-primary/30 transition-all text-left text-web3-textMuted hover:text-web3-text"
                    >
                      <Plus size={14} className="shrink-0" />
                      <span className="text-sm">New sub-page</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Owner-only (grant_access/revoke_access assert owner on-chain) - not rendered at all in
          shared mode, matching the hidden Share button. */}
      {!isSharedMode && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          notebookId={notebookId ?? null}
        />
      )}
    </LexicalComposer>
  );
};