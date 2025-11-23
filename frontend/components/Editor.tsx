import React, { useEffect, useState } from 'react';
import { Note } from '../types';
import { Type, Bold, Italic, Underline, CheckSquare, Share, Trash, PenLine } from 'lucide-react';

interface EditorProps {
  note: Note | null;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onDeleteNote: (id: string) => void;
  onCreateNote: () => void;
}

export const Editor: React.FC<EditorProps> = ({ 
  note, 
  onUpdateNote, 
  onDeleteNote,
  onCreateNote
}) => {
  const [localTitle, setLocalTitle] = useState('');
  const [localContent, setLocalContent] = useState('');

  // Sync state when note selection changes
  useEffect(() => {
    if (note) {
      setLocalTitle(note.title);
      setLocalContent(note.content);
    } else {
      setLocalTitle('');
      setLocalContent('');
    }
  }, [note]);

  if (!note) {
    return (
      <div className="flex-1 h-full bg-white flex items-center justify-center text-gray-300 flex-col gap-4">
        <PenLine size={64} strokeWidth={1} />
        <p className="font-medium">No Note Selected</p>
        <button 
            onClick={onCreateNote}
            className="mt-2 text-sm text-yellow-600 hover:text-yellow-700 transition-colors"
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

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalContent(newVal);
    onUpdateNote(note.id, { content: newVal, updatedAt: new Date() });
  };

  const formattedDate = note.updatedAt.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  return (
    <div className="flex-1 h-full bg-white flex flex-col">
        {/* Toolbar */}
        <div className="h-12 border-b border-gray-100 flex items-center justify-between px-6">
            <div className="flex items-center gap-4 text-gray-500">
                <button className="hover:text-black hover:bg-gray-100 p-1 rounded transition-all"><Type size={18} /></button>
                <div className="h-4 w-[1px] bg-gray-200"></div>
                <button className="hover:text-black hover:bg-gray-100 p-1 rounded transition-all"><Bold size={16} /></button>
                <button className="hover:text-black hover:bg-gray-100 p-1 rounded transition-all"><Italic size={16} /></button>
                <button className="hover:text-black hover:bg-gray-100 p-1 rounded transition-all"><Underline size={16} /></button>
                <div className="h-4 w-[1px] bg-gray-200"></div>
                <button className="hover:text-black hover:bg-gray-100 p-1 rounded transition-all"><CheckSquare size={16} /></button>
            </div>
            
            <div className="flex items-center gap-4 text-gray-500">
                 <button 
                    onClick={() => onDeleteNote(note.id)}
                    className="hover:text-red-500 hover:bg-red-50 p-1 rounded transition-all"
                    title="Delete Note"
                >
                    <Trash size={16} />
                </button>
                <button className="hover:text-yellow-600 hover:bg-yellow-50 p-1 rounded transition-all">
                    <Share size={16} />
                </button>
            </div>
        </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto pt-8 px-8 pb-20">
            {/* Timestamp */}
            <div className="text-center text-xs text-gray-400 mb-6 font-medium">
                {formattedDate}
            </div>

            {/* Title Input */}
            <textarea
                value={localTitle}
                onChange={handleTitleChange}
                placeholder="Title"
                rows={1}
                className="w-full text-3xl font-bold text-gray-900 placeholder-gray-300 resize-none border-none focus:ring-0 p-0 bg-transparent leading-tight mb-4"
                style={{ minHeight: '48px', overflow: 'hidden' }}
                onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = target.scrollHeight + 'px';
                }}
            />

            {/* Body Input */}
            <textarea
                value={localContent}
                onChange={handleContentChange}
                placeholder="Start typing..."
                className="w-full h-[60vh] text-base text-gray-700 placeholder-gray-300 resize-none border-none focus:ring-0 p-0 bg-transparent leading-relaxed"
            />
        </div>
      </div>
    </div>
  );
};