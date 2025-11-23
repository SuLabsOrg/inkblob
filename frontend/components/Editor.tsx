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
    <div className="flex-1 h-full flex flex-col backdrop-blur-sm bg-web3-card/10">
      {/* Toolbar */}
      <div className="h-12 border-b border-web3-border/50 flex items-center justify-between px-6 bg-web3-card/20">
        <div className="flex items-center gap-2 text-web3-textMuted">
          <button className="hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all"><Type size={18} /></button>
          <div className="h-4 w-[1px] bg-web3-border mx-2"></div>
          <button className="hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all"><Bold size={16} /></button>
          <button className="hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all"><Italic size={16} /></button>
          <button className="hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all"><Underline size={16} /></button>
          <div className="h-4 w-[1px] bg-web3-border mx-2"></div>
          <button className="hover:text-web3-primary hover:bg-web3-cardHover p-1.5 rounded-md transition-all"><CheckSquare size={16} /></button>
        </div>

        <div className="flex items-center gap-2 text-web3-textMuted">
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

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-3xl mx-auto pt-8 px-8 pb-20">
          {/* Timestamp */}
          <div className="text-center text-xs text-web3-textMuted/60 mb-8 font-medium tracking-widest uppercase">
            {formattedDate}
          </div>

          {/* Title Input */}
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

          {/* Body Input */}
          <textarea
            value={localContent}
            onChange={handleContentChange}
            placeholder="Start typing..."
            className="w-full h-[60vh] text-lg text-web3-text/90 placeholder-web3-textMuted/30 resize-none border-none focus:ring-0 p-0 bg-transparent leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
};