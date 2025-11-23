import React from 'react';
import { Note } from '../types';
import { Search, Plus } from 'lucide-react';

interface NoteListProps {
  notes: Note[];
  selecteInkBlobId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const NoteList: React.FC<NoteListProps> = ({
  notes,
  selecteInkBlobId,
  onSelectNote,
  onCreateNote,
  searchQuery,
  onSearchChange
}) => {

  const formatDate = (date: Date) => {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString();
  };

  return (
    <div className="w-80 bg-web3-card/20 h-full border-r border-web3-border/50 flex flex-col backdrop-blur-sm">
      {/* Search Header */}
      <div className="p-4 pb-2 space-y-3">
        <div className="relative group">
          <Search className="absolute left-3 top-2.5 text-web3-textMuted group-focus-within:text-web3-accent transition-colors" size={14} />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-web3-bg/50 pl-9 pr-3 py-2 text-sm rounded-lg border border-web3-border focus:border-web3-accent/50 focus:ring-1 focus:ring-web3-accent/50 text-web3-text placeholder-web3-textMuted transition-all outline-none"
          />
        </div>
        <button
          onClick={onCreateNote}
          className="w-full py-2 bg-web3-primary text-white rounded-lg font-medium text-sm hover:bg-web3-primary/90 transition-all shadow-lg shadow-web3-primary/20 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Create New Note
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <h3 className="px-5 py-2 text-xs font-semibold text-web3-textMuted/70 uppercase tracking-widest">
          {notes.length > 0 ? 'Recent' : 'No notes'}
        </h3>

        <ul className="space-y-1 px-2">
          {notes.map(note => (
            <li key={note.id}>
              <button
                onClick={() => onSelectNote(note.id)}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 group border border-transparent ${selecteInkBlobId === note.id
                  ? 'bg-web3-cardHover border-web3-primary/30 shadow-lg'
                  : 'hover:bg-web3-card/40 hover:border-web3-border/30'
                  }`}
              >
                <div className={`text-sm font-bold mb-1 transition-colors ${selecteInkBlobId === note.id ? 'text-web3-primary' : 'text-web3-text group-hover:text-white'}`}>
                  {note.title || 'New Note'}
                </div>
                <div className="flex gap-2 items-center">
                  <span className={`text-xs ${selecteInkBlobId === note.id ? 'text-web3-textMuted' : 'text-web3-textMuted/70'}`}>
                    {formatDate(note.updatedAt)}
                  </span>
                  <span className={`text-xs truncate flex-1 ${selecteInkBlobId === note.id ? 'text-web3-text/80' : 'text-web3-textMuted'}`}>
                    {note.content.substring(0, 30) || 'No additional text'}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};