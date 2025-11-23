import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { Editor } from './components/Editor';
import { ThemeProvider } from './context/ThemeContext';
import { EncryptionProvider, useEncryption } from './context/EncryptionContext';
import { SessionProvider, useSession } from './context/SessionContext';
import { SyncProvider } from './context/SyncContext';
import { Onboarding } from './components/Onboarding';
import { LandingPage } from './components/LandingPage';
import { useFolders } from './hooks/useFolders';
import { useNotes } from './hooks/useNotes';
import { useNotebook } from './hooks/useNotebook';
import { useSuiService } from './hooks/useSuiService';
import { Folder, Note } from './types';
import { encryptText } from './crypto/encryption';
import * as walrusService from './services/walrus';

// Mock Data (Fallback)
const INITIAL_FOLDERS: Folder[] = [
  { id: 'notes', name: 'Notes', icon: 'file-text', type: 'system' },
  { id: 'trash', name: 'Trash', icon: 'trash', type: 'system' },
];

function AppContent() {
  const currentAccount = useCurrentAccount();
  const { encryptionKey } = useEncryption();
  const { data: notebook, isLoading: isNotebookLoading, refetch: refetchNotebook } = useNotebook();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const suiService = useSuiService();
  const { isSessionValid, sessionCap, ephemeralKeypair } = useSession();

  // Hooks for data fetching
  const { data: fetchedFolders } = useFolders();
  const { data: fetchedNotes } = useNotes();

  // State
  const [folders, setFolders] = useState<Folder[]>(INITIAL_FOLDERS);
  const [notes, setNotes] = useState<Note[]>([]);

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
  const handleCreateNote = async () => {
    // 1. Optimistic Update
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: 'New Note',
      content: '',
      folderId: selectedFolderId === 'trash' || selectedFolderId === 'all' ? 'notes' : selectedFolderId,
      updatedAt: new Date(),
      blobId: '',
    };
    setNotes([newNote, ...notes]);
    setSelecteInkBlobId(newNote.id);

    if (!notebook?.data?.objectId || !encryptionKey) {
      // Fallback for local testing if notebook not ready (bypassed mode)
      return;
    }

    try {
      const encryptedTitle = await encryptText('New Note', encryptionKey);
      const tx = suiService.createNoteTx(notebook.data.objectId, encryptedTitle, selectedFolderId === 'all' ? null : selectedFolderId);

      await signAndExecuteTransaction({ transaction: tx });
      // SyncContext will handle invalidation
    } catch (error) {
      console.error('Failed to create note:', error);
      alert('Failed to create note');
      // Revert optimistic update
      setNotes(prev => prev.filter(n => n.id !== newNote.id));
      if (selecteInkBlobId === newNote.id) setSelecteInkBlobId(null);
    }
  };

  const handleCreateFolder = async () => {
    const name = prompt("Enter folder name:");
    if (!name) return;

    // 1. Optimistic Update
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name,
      icon: 'folder',
      type: 'user'
    };
    setFolders([...folders, newFolder]);

    if (!notebook?.data?.objectId || !encryptionKey) {
      // Local fallback
      return;
    }

    try {
      const encryptedName = await encryptText(name, encryptionKey);
      const tx = suiService.createFolderTx(notebook.data.objectId, encryptedName, null);
      await signAndExecuteTransaction({ transaction: tx });
    } catch (error) {
      console.error('Failed to create folder:', error);
      alert('Failed to create folder');
      // Revert optimistic update
      setFolders(prev => prev.filter(f => f.id !== newFolder.id));
    }
  };

  const handleUpdateNote = async (id: string, updates: Partial<Note>) => {
    // Optimistic update
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));

    if (!notebook?.data?.objectId || !encryptionKey) return;

    try {
      const note = notes.find(n => n.id === id);
      if (!note) return;

      const newTitle = updates.title ?? note.title;
      const newContent = updates.content ?? note.content;

      // 1. Upload to Walrus if content changed
      let blobId = note.blobId;
      if (updates.content !== undefined) {
        const result = await walrusService.uploadInkBlobContent(newContent, encryptionKey);
        blobId = result.blobId;
      }

      // 2. Encrypt title
      const encryptedTitle = await encryptText(newTitle, encryptionKey);

      // 3. Update on Sui
      const capId = isSessionValid && sessionCap ? sessionCap.objectId : null;
      const tx = suiService.updateNoteTx(
        notebook.data.objectId,
        capId,
        id,
        blobId,
        encryptedTitle,
        note.folderId
      );

      if (isSessionValid && ephemeralKeypair) {
        await suiService.executeWithSession(tx, ephemeralKeypair);
      } else {
        await signAndExecuteTransaction({ transaction: tx });
      }

    } catch (error) {
      console.error('Failed to update note:', error);
      // Revert optimistic update?
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this note?")) {
      // Optimistic delete
      setNotes(prev => prev.filter(n => n.id !== id));
      if (selecteInkBlobId === id) setSelecteInkBlobId(null);

      if (!notebook?.data?.objectId) return;

      try {
        const tx = suiService.deleteNoteTx(notebook.data.objectId, id);
        await signAndExecuteTransaction({ transaction: tx });
      } catch (error) {
        console.error('Failed to delete note:', error);
        alert('Failed to delete note');
      }
    }
  };

  // --- Render Logic ---

  // 1. Not Connected
  if (!currentAccount) {
    return <LandingPage />;
  }

  // 2. Connected, but Locked (No Encryption Key)
  if (!encryptionKey) {
    return <Onboarding mode="unlock" />;
  }

  // 3. Unlocked, but No Notebook (New User)
  // We need to wait for notebook query to finish
  if (isNotebookLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // if (!notebook) {
  //   return <Onboarding mode="initialize" onComplete={refetchNotebook} />;
  // }

  // 4. Main App (Unlocked & Initialized)
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
        onCreateFolder={handleCreateFolder}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-14 border-b flex items-center justify-between px-4 bg-card">
          <div className="flex items-center gap-2">
            {/* Header Content */}
          </div>
          <div className="flex items-center gap-4">
            <ConnectButton />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <NoteList
            notes={filtereInkBlobs}
            selectedNoteId={selecteInkBlobId}
            onSelectNote={setSelecteInkBlobId}
            onCreateNote={handleCreateNote}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          <main className="flex-1 bg-background overflow-y-auto relative">
            {selecteInkBlobId ? (
              <Editor
                note={notes.find(n => n.id === selecteInkBlobId)!}
                onUpdate={handleUpdateNote}
                onDelete={handleDeleteNote}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select a note or create a new one
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <EncryptionProvider>
        <SessionProvider>
          <SyncProvider>
            <AppContent />
          </SyncProvider>
        </SessionProvider>
      </EncryptionProvider>
    </ThemeProvider>
  );
}