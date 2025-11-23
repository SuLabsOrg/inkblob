import React, { useState, useMemo, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { Editor } from './components/Editor';
import { Note, Folder } from './types';
import { Sidebar as SidebarIcon, Edit } from 'lucide-react';

const INITIAL_FOLDERS: Folder[] = [
  { id: 'all', name: 'All iCloud', icon: 'archive', type: 'system' },
  { id: 'notes', name: 'Notes', icon: 'folder', type: 'system' },
  { id: 'smart', name: 'Smart Folder', icon: 'smart', type: 'user' },
  { id: 'trash', name: 'Recently Deleted', icon: 'trash', type: 'system' },
];

const INITIAL_NOTES: Note[] = [
  {
    id: '1',
    title: 'Project Ideas',
    content: '1. DApp for Notes\n2. AI Integration\n3. Web3 Login',
    folderId: 'notes',
    updatedAt: new Date(),
  },
  {
    id: '2',
    title: 'Groceries',
    content: 'Milk\nEggs\nBread\nCoffee Beans',
    folderId: 'notes',
    updatedAt: new Date(Date.now() - 86400000), // Yesterday
  }
];

export default function App() {
  // State
  const [folders] = useState<Folder[]>(INITIAL_FOLDERS);
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('notes');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Derived State
  const filteredNotes = useMemo(() => {
    let filtered = notes;

    // Folder Filter
    if (selectedFolderId === 'trash') {
        // In a real app, we'd have a 'deleted' flag. 
        // For this demo, we'll just show empty or a specific set.
        // Let's assume 'trash' is currently empty for simplicity unless we move things there.
        // For the sake of the demo, let's just show all notes if 'all' is selected.
    } else if (selectedFolderId !== 'all') {
        filtered = filtered.filter(n => n.folderId === selectedFolderId || selectedFolderId === 'all');
    }

    // Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n => 
        n.title.toLowerCase().includes(q) || 
        n.content.toLowerCase().includes(q)
      );
    }

    // Sort by Date Descending
    return filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }, [notes, selectedFolderId, searchQuery]);

  // Actions
  const handleCreateNote = () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: '',
      content: '',
      folderId: selectedFolderId === 'trash' || selectedFolderId === 'all' ? 'notes' : selectedFolderId,
      updatedAt: new Date(),
    };
    setNotes([newNote, ...notes]);
    setSelectedNoteId(newNote.id);
  };

  const handleUpdateNote = (id: string, updates: Partial<Note>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const handleDeleteNote = (id: string) => {
    // For this demo, we actually delete. In a full app, move to trash folder.
    if (window.confirm("Are you sure you want to delete this note?")) {
        setNotes(prev => prev.filter(n => n.id !== id));
        if (selectedNoteId === id) setSelectedNoteId(null);
    }
  };

  const activeNote = notes.find(n => n.id === selectedNoteId) || null;

  return (
    <div className="flex h-screen w-full bg-white text-mac-text font-sans overflow-hidden">
      
      {/* Sidebar (Collapsible) */}
      <Sidebar 
        folders={folders} 
        selectedFolderId={selectedFolderId} 
        onSelectFolder={(id) => {
            setSelectedFolderId(id);
            setSelectedNoteId(null);
        }}
        isOpen={sidebarOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        
        {/* Global Toolbar / Drag Region */}
        <div className="h-10 bg-mac-sidebar/50 backdrop-blur-md border-b border-mac-border flex items-center justify-between px-4 select-none">
            <div className="flex items-center gap-3">
                <button 
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className={`p-1 rounded hover:bg-black/10 transition-colors ${!sidebarOpen ? 'text-gray-400' : 'text-yellow-600'}`}
                >
                    <SidebarIcon size={18} />
                </button>
                <span className="text-sm font-semibold text-gray-500">
                    {folders.find(f => f.id === selectedFolderId)?.name}
                </span>
            </div>
            
            <button 
                onClick={handleCreateNote}
                className="p-1 text-gray-500 hover:text-yellow-600 transition-colors"
                title="New Note"
            >
                <Edit size={18} />
            </button>
        </div>

        {/* Note List & Editor Split */}
        <div className="flex-1 flex overflow-hidden">
            <NoteList 
                notes={filteredNotes}
                selectedNoteId={selectedNoteId}
                onSelectNote={setSelectedNoteId}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />
            <Editor 
                note={activeNote}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={handleDeleteNote}
                onCreateNote={handleCreateNote}
            />
        </div>
      </div>

    </div>
  );
}