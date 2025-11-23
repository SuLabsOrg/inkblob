import React from 'react';
import { Note } from '../types';
import { Search } from 'lucide-react';

interface NoteListProps {
  notes: Note[];
  selecteInkBlobId: string | null;
  onSelectNote: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const NoteList: React.FC<NoteListProps> = ({
  notes,
  selecteInkBlobId,
  onSelectNote,
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
    <div className="w-80 bg-white h-full border-r border-mac-border flex flex-col">
      {/* Search Header */}
      <div className="p-4 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1.5 text-gray-400" size={14} />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-gray-100 pl-8 pr-3 py-1 text-sm rounded-md border-none focus:ring-2 focus:ring-yellow-400/50 focus:bg-white transition-all outline-none placeholder-gray-400"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="px-5 py-1 text-xs font-semibold text-mac-textMuted mt-2 mb-1">
            {notes.length > 0 ? 'Today' : 'No notes'}
        </h3>
        
        <ul className="space-y-0.5 px-2">
          {notes.map(note => (
            <li key={note.id}>
              <button
                onClick={() => onSelectNote(note.id)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-150 group ${
                  selecteInkBlobId === note.id
                    ? 'bg-yellow-100' // Classic active color
                    : 'hover:bg-mac-sidebar'
                }`}
              >
                <div className={`text-sm font-bold mb-0.5 ${selecteInkBlobId === note.id ? 'text-black' : 'text-gray-900'}`}>
                  {note.title || 'New Note'}
                </div>
                <div className="flex gap-2">
                    <span className={`text-xs ${selecteInkBlobId === note.id ? 'text-gray-700' : 'text-gray-500'}`}>
                        {formatDate(note.updatedAt)}
                    </span>
                    <span className={`text-xs truncate ${selecteInkBlobId === note.id ? 'text-gray-600' : 'text-gray-400'}`}>
                        {note.content.substring(0, 30) || 'No additional text'}
                    </span>
                </div>
              </button>
              {/* Divider simulation */}
              <div className="mx-4 h-[1px] bg-gray-100 my-0.5" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};