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
import { Modal } from './components/Modal';
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

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);

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

  const openCreateFolderModal = () => {
    setNewFolderName('');
    setIsFolderModalOpen(true);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const name = newFolderName.trim();
    setIsFolderModalOpen(false);

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
      const confirmDeleteNote = async () => {
        if (!deleteNoteId) return;
        const id = deleteNoteId;
        setDeleteNoteId(null);

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
            onCreateFolder={openCreateFolderModal}
            isOpen={sidebarOpen}
          // onToggle={() => setSidebarOpen(!sidebarOpen)}
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
                selecteInkBlobId={selecteInkBlobId}
                onSelectNote={setSelecteInkBlobId}
                onCreateNote={handleCreateNote}
                searchQuery={searchQuery}
            </div>
          </div>

          <Modal
            isOpen={isFolderModalOpen}
            onClose={() => setIsFolderModalOpen(false)}
            title="Create New Folder"
          >
            <div className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="Folder Name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full bg-web3-bg/50 px-4 py-2 rounded-lg border border-web3-border focus:border-web3-primary focus:ring-1 focus:ring-web3-primary outline-none text-web3-text"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsFolderModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-web3-textMuted hover:bg-web3-cardHover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateFolder}
                  className="px-4 py-2 rounded-lg bg-web3-primary text-white hover:bg-web3-primary/90 transition-colors font-medium"
                >
                  Create Folder
                </button>
              </div>
            </div>
          </Modal>

          <Modal
            isOpen={!!deleteNoteId}
            onClose={() => setDeleteNoteId(null)}
            title="Delete Note"
          >
            <div className="flex flex-col gap-4">
              <p className="text-web3-textMuted">Are you sure you want to delete this note? This action cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeleteNoteId(null)}
                  className="px-4 py-2 rounded-lg text-web3-textMuted hover:bg-web3-cardHover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteNote}
                  className="px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors font-medium border border-red-500/20"
                >
                  Delete Note
                </button>
              </div>
            </div>
          </Modal>
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