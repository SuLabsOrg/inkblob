import React, { useState, useMemo, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { Editor } from './components/Editor';
import { Header } from './components/Header';
import { Note, Folder } from './types';
import { useFolders } from './hooks/useFolders';
import { useNotes } from './hooks/useNotes';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { ThemeProvider } from './context/ThemeContext';

// Mock data for fallback
const INITIAL_FOLDERS: Folder[] = [
  { id: 'all', name: 'All Notes', icon: 'archive', type: 'system' },
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
  const currentAccount = useCurrentAccount();

  // Hooks for data fetching
  const { data: fetchedFolders } = useFolders();
  const { data: fetchedNotes } = useNotes();

  // State
  // Use fetched data if available, otherwise mock data (or empty if connected but no data)
  // For MVP, we'll merge or toggle. 
  // If wallet connected, try to use fetched data. If not, use local mock.
  const [folders, setFolders] = useState<Folder[]>(INITIAL_FOLDERS);
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);

  const [selectedFolderId, setSelectedFolderId] = useState<string>('notes');
  const [selecteInkBlobId, setSelecteInkBlobId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Effect to update state when hooks return data
  useEffect(() => {
    if (currentAccount && fetchedFolders && fetchedFolders.length > 0) {
      setFolders(fetchedFolders);
    }
  }, [fetchedFolders, currentAccount]);

  useEffect(() => {
    if (currentAccount && fetchedNotes && fetchedNotes.length > 0) {
      setNotes(fetchedNotes);
    }
  }, [fetchedNotes, currentAccount]);

  // Derived State
  const filtereInkBlobs = useMemo(() => {
    let filtered = notes;

    // Folder Filter
    if (selectedFolderId === 'trash') {
      // Trash logic
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
    setSelecteInkBlobId(newNote.id);

    // TODO: Call suiService.createNoteTx() and walrusService.uploadInkBlobContent()
  };

  const handleCreateFolder = () => {
    const name = prompt("Enter folder name:");
    if (name) {
      const newFolder: Folder = {
        id: crypto.randomUUID(),
        name,
        icon: 'folder',
        type: 'user'
      };
      setFolders([...folders, newFolder]);
      // TODO: Call suiService.createFolderTx()
    }
  };

  const handleUpdateNote = (id: string, updates: Partial<Note>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));

    // TODO: Implement Debounced Auto-save
    // 1. Encrypt content
    // 2. Upload to Walrus -> get Blob ID
    // 3. Update Note Object on Sui with new Blob ID
  };

  const handleDeleteNote = (id: string) => {
    if (window.confirm("Are you sure you want to delete this note?")) {
      setNotes(prev => prev.filter(n => n.id !== id));
      if (selecteInkBlobId === id) setSelecteInkBlobId(null);
      // TODO: Call suiService.deleteNoteTx()
    }
  };

  const activeNote = notes.find(n => n.id === selecteInkBlobId) || null;

  return (
    <ThemeProvider>
      <div className="flex h-screen w-full bg-web3-bg text-web3-text font-sans overflow-hidden bg-hero-glow bg-cover bg-no-repeat bg-fixed transition-colors duration-300">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl z-0 dark:bg-black/80 bg-white/60"></div>

        <div className="relative z-10 flex h-full w-full">
          {/* Sidebar (Collapsible) */}
          <Sidebar
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={(id) => {
              setSelectedFolderId(id);
              setSelecteInkBlobId(null);
            }}
            onCreateFolder={handleCreateFolder}
            isOpen={sidebarOpen}
          />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col h-full min-w-0 glass m-4 rounded-2xl overflow-hidden shadow-2xl border-web3-border/50">

            {/* Header with Wallet Connect */}
            <Header
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              folderName={folders.find(f => f.id === selectedFolderId)?.name}
              onCreateNote={handleCreateNote}
            />

            {/* Note List & Editor Split */}
            <div className="flex-1 flex overflow-hidden">
              <NoteList
                notes={filtereInkBlobs}
                selecteInkBlobId={selecteInkBlobId}
                onSelectNote={setSelecteInkBlobId}
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
      </div>
    </ThemeProvider>
  );
}