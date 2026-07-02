import { Coins, MoreHorizontal, Pin, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { NOTE_DELETE_ENABLED, NOTE_DELETE_DISABLED_REASON } from '../config/featureFlags';
import { usePinnedNotes } from '../hooks/usePinnedNotes';
import { Folder, Note } from '../types';
import { FolderPicker } from './FolderPicker';

interface NoteListProps {
  notes: Note[];
  folders: Folder[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onMoveNote: (noteId: string, folderId: string | null) => void;
  onDeleteNote?: (id: string) => void;
  onRestoreNote?: (id: string) => void;
  // Claims the escrowed WAL storage-fee rebate for a deleted-but-not-yet-refunded note (see
  // suiService.ts's claimWalRebateTx / notebook.move's claim_wal_storage_rebate). Optional so
  // NoteList doesn't require every caller to wire this up.
  onClaimWalRebate?: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchFocus?: () => void;
  /** True when viewing a shared notebook with a READ-only grant - hides every mutation
   *  affordance (create, move, delete, restore) and disables note dragging. Pin deliberately
   *  stays enabled: it's a localStorage-only client preference, not an on-chain mutation.
   *  Default false = all existing behavior. */
  readOnly?: boolean;
  /** True when viewing a shared notebook at EITHER permission level - hides "Claim WAL Rebate"
   *  (the rebate refunds the OWNER's escrowed WAL; owner-only affordance). Default false. */
  isSharedMode?: boolean;
}

const NOTE_DRAG_TYPE = 'application/x-inkblob-note';

export const NoteList: React.FC<NoteListProps> = ({
  notes,
  folders,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onMoveNote,
  onDeleteNote,
  onRestoreNote,
  onClaimWalRebate,
  searchQuery,
  onSearchChange,
  onSearchFocus,
  readOnly = false,
  isSharedMode = false,
}) => {
  const { pinnedIds, togglePin } = usePinnedNotes();
  const [menuNoteId, setMenuNoteId] = useState<string | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<{ noteId: string; rect: { top: number; left: number; right: number } } | null>(null);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const formatDate = (date: Date) => {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString();
  };

  const pinnedNotes = notes.filter(n => pinnedIds.has(n.id));
  const unpinnedNotes = notes.filter(n => !pinnedIds.has(n.id));

  const openMoveMenu = (noteId: string) => {
    const btn = menuButtonRefs.current[noteId];
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setPickerAnchor({ noteId, rect: { top: rect.bottom + 4, left: rect.left, right: rect.right } });
    setMenuNoteId(null);
  };

  const renderNoteRow = (note: Note) => (
    <li key={note.id} className="relative group/row">
      <button
        draggable={!readOnly}
        onDragStart={(e) => {
          if (readOnly) return;
          e.dataTransfer.setData(NOTE_DRAG_TYPE, note.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => onSelectNote(note.id)}
        className={`w-full text-left pl-4 pr-9 py-3 rounded-xl transition-all duration-200 group border border-transparent ${selectedNoteId === note.id
          ? 'bg-web3-cardHover border-web3-primary/30 shadow-lg'
          : 'hover:bg-web3-card/40 hover:border-web3-border/30'
          }`}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {pinnedIds.has(note.id) && <Pin size={11} className="text-web3-accent shrink-0" fill="currentColor" />}
          <div className={`text-sm font-bold truncate transition-colors ${selectedNoteId === note.id ? 'text-web3-primary' : 'text-web3-text'}`}>
            {note.title || 'New Note'}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <span className={`text-xs ${selectedNoteId === note.id ? 'text-web3-textMuted' : 'text-web3-textMuted/70'}`}>
            {formatDate(note.updatedAt)}
          </span>
          <span className={`text-xs truncate flex-1 ${selectedNoteId === note.id ? 'text-web3-text/80' : 'text-web3-textMuted'}`}>
            {note.content.substring(0, 30) || 'No additional text'}
          </span>
        </div>
      </button>

      <div className="absolute top-2 right-1.5 flex items-center opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); togglePin(note.id); }}
          title={pinnedIds.has(note.id) ? 'Unpin' : 'Pin'}
          aria-label={pinnedIds.has(note.id) ? 'Unpin note' : 'Pin note'}
          className="p-1 rounded hover:bg-web3-cardHover text-web3-textMuted hover:text-web3-accent"
        >
          <Pin size={13} fill={pinnedIds.has(note.id) ? 'currentColor' : 'none'} />
        </button>
        {/* In read-only shared mode every menu entry below would be hidden, so the menu opener
            itself goes too rather than opening an empty popover. */}
        {!readOnly && (
          <button
            ref={(el) => { menuButtonRefs.current[note.id] = el; }}
            onClick={(e) => { e.stopPropagation(); setMenuNoteId(menuNoteId === note.id ? null : note.id); }}
            title="More options"
            aria-label="More options"
            className="p-1 rounded hover:bg-web3-cardHover text-web3-textMuted hover:text-web3-text"
          >
            <MoreHorizontal size={13} />
          </button>
        )}
      </div>

      {menuNoteId === note.id && !readOnly && (
        <div className="absolute top-8 right-1.5 z-40 w-40 rounded-lg border border-web3-border bg-web3-card shadow-xl p-1 animate-in fade-in zoom-in-95 duration-100">
          {!note.isDeleted && (
            <button
              onClick={() => openMoveMenu(note.id)}
              className="w-full text-left px-2 py-1.5 text-sm rounded text-web3-text hover:bg-web3-cardHover"
            >
              Move to folder...
            </button>
          )}
          {note.isDeleted ? (
            <>
              <button
                onClick={() => { onRestoreNote?.(note.id); setMenuNoteId(null); }}
                className="w-full flex items-center gap-1.5 text-left px-2 py-1.5 text-sm rounded text-web3-text hover:bg-web3-cardHover"
              >
                <RotateCcw size={13} />
                Restore
              </button>
              {/* Owner-only: the rebate refunds the notebook OWNER's escrowed WAL, so it's
                  hidden for grantees in BOTH shared modes. */}
              {!isSharedMode && !!note.walPaid && note.walPaid > 0 && !note.rebateClaimed && (
                <button
                  onClick={() => { onClaimWalRebate?.(note.id); setMenuNoteId(null); }}
                  title="Claim back the WAL storage fee escrowed for this note"
                  className="w-full flex items-center gap-1.5 text-left px-2 py-1.5 text-sm rounded text-web3-accent hover:bg-web3-cardHover"
                >
                  <Coins size={13} />
                  Claim WAL Rebate
                </button>
              )}
            </>
          ) : (
            <button
              disabled={!NOTE_DELETE_ENABLED}
              onClick={NOTE_DELETE_ENABLED ? () => { onDeleteNote?.(note.id); setMenuNoteId(null); } : undefined}
              title={NOTE_DELETE_ENABLED ? undefined : NOTE_DELETE_DISABLED_REASON}
              className={`w-full flex items-center gap-1.5 text-left px-2 py-1.5 text-sm rounded ${NOTE_DELETE_ENABLED
                ? 'text-web3-text hover:bg-web3-cardHover'
                : 'text-web3-textMuted/40 cursor-not-allowed'
                }`}
            >
              <Trash2 size={13} />
              Delete
            </button>
          )}
        </div>
      )}
    </li>
  );

  return (
    <div className="w-full md:w-80 bg-web3-card/20 h-full border-r border-web3-border/50 flex flex-col backdrop-blur-sm">
      {/* Search Header */}
      <div className="p-4 pb-2 space-y-3">
        <div className="relative group">
          <Search className="absolute left-3 top-2.5 text-web3-textMuted group-focus-within:text-web3-accent transition-colors" size={14} />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={onSearchFocus}
            className="w-full bg-web3-bg/50 pl-9 pr-3 py-2 text-sm rounded-lg border border-web3-border focus:border-web3-accent/50 focus:ring-1 focus:ring-web3-accent/50 text-web3-text placeholder-web3-textMuted transition-all outline-none"
          />
        </div>
        {/* Hidden in read-only shared mode; kept for shared WRITE grants (create_note accepts
            write-grantees on-chain). */}
        {!readOnly && (
          <button
            onClick={onCreateNote}
            className="w-full py-2 bg-web3-primary text-white rounded-lg font-medium text-sm hover:bg-web3-primary/90 transition-all shadow-lg shadow-web3-primary/20 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            Create New Note
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar" onClick={() => setMenuNoteId(null)}>
        {pinnedNotes.length > 0 && (
          <>
            <h3 className="px-5 py-2 text-xs font-semibold text-web3-textMuted/70 uppercase tracking-widest">Pinned</h3>
            <ul className="space-y-1 px-2 mb-2">
              {pinnedNotes.map(renderNoteRow)}
            </ul>
          </>
        )}

        <h3 className="px-5 py-2 text-xs font-semibold text-web3-textMuted/70 uppercase tracking-widest">
          {notes.length > 0 ? 'Recent' : 'No notes'}
        </h3>

        <ul className="space-y-1 px-2">
          {unpinnedNotes.map(renderNoteRow)}
        </ul>
      </div>

      {pickerAnchor && (
        <FolderPicker
          folders={folders.filter(f => !f.isDeleted)}
          anchorRect={pickerAnchor.rect}
          onSelect={(folderId) => {
            onMoveNote(pickerAnchor.noteId, folderId);
            setPickerAnchor(null);
          }}
          onClose={() => setPickerAnchor(null)}
        />
      )}
    </div>
  );
};
