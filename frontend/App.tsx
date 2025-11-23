import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { useEffect, useMemo, useState } from 'react';
import { Editor } from './components/Editor';
import { LandingPage } from './components/LandingPage';
import { Modal } from './components/Modal';
import { NoteList } from './components/NoteList';
import { Onboarding } from './components/Onboarding';
import { Sidebar } from './components/Sidebar';
import { EncryptionProvider, useEncryption } from './context/EncryptionContext';
import { SessionProvider, useSession } from './context/SessionContext';
import { SyncProvider } from './context/SyncContext';
import { ThemeProvider } from './context/ThemeContext';
import { encryptText } from './crypto/encryption';
import { useFolders } from './hooks/useFolders';
import { useNotebook } from './hooks/useNotebook';
import { useNotes } from './hooks/useNotes';
import { useSuiService } from './hooks/useSuiService';
import * as walrusService from './services/walrus';
import { Folder, Note } from './types';

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
  const { isSessionValid, sessionCap, ephemeralKeypair, authorizeSession } = useSession();

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

  // Notebook initialization state
  const [isInitializingNotebook, setIsInitializingNotebook] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);

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

  // Auto-initialize notebook after unlock
  useEffect(() => {
    const initializeNotebook = async () => {
      // Only run if:
      // 1. User is connected
      // 2. Encryption key is derived (unlocked)
      // 3. Notebook query has completed (not loading)
      // 4. No notebook exists
      // 5. Not already initializing
      if (!currentAccount || !encryptionKey || isNotebookLoading || notebook || isInitializingNotebook) {
        return;
      }

      console.log('[App] Auto-initialization triggered:', {
        account: currentAccount.address,
        hasEncryptionKey: !!encryptionKey,
        notebookExists: !!notebook,
        isInitializing: isInitializingNotebook,
      });

      setIsInitializingNotebook(true);
      setInitializationError(null);

      try {
        // Generate a default notebook name with timestamp
        const notebookName = `My Notebook - ${new Date().toLocaleDateString()}`;

        console.log('[App] Creating notebook transaction with name:', notebookName);
        const tx = suiService.createNotebookTx(notebookName);

        console.log('[App] Signing and executing transaction...');
        const result = await signAndExecuteTransaction({
          transaction: tx,
        });

        console.log('[App] Notebook creation successful:', result);

        // Wait for blockchain state to propagate (2 seconds)
        console.log('[App] Waiting for blockchain state propagation...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Refetch notebook to update UI
        console.log('[App] Refetching notebook...');
        const refetchResult = await refetchNotebook();

        if (refetchResult.data) {
          console.log('[App] Notebook initialization complete:', refetchResult.data);
        } else {
          console.warn('[App] Notebook refetch returned no data, but creation succeeded');
        }

      } catch (error) {
        console.error('[App] Failed to initialize notebook:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setInitializationError(errorMessage);

        // Show user-friendly error
        alert(
          'Failed to initialize your notebook on Sui blockchain.\n\n' +
          'Error: ' + errorMessage + '\n\n' +
          'Please try refreshing the page or check your wallet balance.'
        );
      } finally {
        setIsInitializingNotebook(false);
      }
    };

    initializeNotebook();
  }, [currentAccount, encryptionKey, notebook, isNotebookLoading, isInitializingNotebook]);

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
    // Generate a proper note ID that matches SUI address format (64 hex chars)
    const generateNoteId = (): string => {
      // Generate 64 random hex characters
      const array = new Uint8Array(32); // 32 bytes = 64 hex chars
      crypto.getRandomValues(array);
      const hexArray = Array.from(array, byte => byte.toString(16).padStart(2, '0'));
      const hex64 = hexArray.join('');
      return `0x${hex64}`;
    };

    const blockchainNoteId = generateNoteId();

    // 1. Optimistic Update
    const newNote: Note = {
      id: blockchainNoteId, // Use blockchain ID for consistency
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

      // Track fresh session auth result (if we just authorized)
      let sessionAuthResult = null;

      // Check session status and prompt for authorization if needed (same as handleSaveNote)
      if (!isSessionValid) {
        console.log('[App] No valid session, prompting user for authorization...');

        const userConfirmed = window.confirm(
          'Enable frictionless note saving?\n\n' +
          'This will create a session key for this device, allowing you to save notes without signing every transaction.\n\n' +
          'You will need to sign twice now, but future saves will be automatic.'
        );

        if (userConfirmed) {
          try {
            console.log('[App] User confirmed, authorizing session...');
            sessionAuthResult = await authorizeSession(notebook.data.objectId);
            console.log('[App] Session authorized successfully:', sessionAuthResult);
          } catch (authError: any) {
            console.error('[App] Session authorization failed:', authError);

            // Special handling for WAL token errors
            if (authError?.message?.includes('WAL')) {
              alert(
                'Session authorization requires WAL tokens.\n\n' +
                'You can get WAL tokens from the testnet faucet, but for now we\'ll continue creating notes with regular wallet signing.\n\n' +
                'Note: Each save will require a signature.'
              );
            } else if (authError?.message?.includes('User rejected')) {
              console.log('[App] User rejected session authorization signature');
              // Silent - user chose not to sign
            } else {
              alert(
                'Session authorization failed.\n\n' +
                'Continuing with regular wallet signing instead.\n\n' +
                'Error: ' + (authError?.message || 'Unknown error')
              );
            }

            // Continue with main wallet mode (fallback)
            console.log('[App] Falling back to main wallet signing mode');
          }

          // Store the session auth result for use below
          // This ensures we use the fresh session info even if context state hasn't updated yet
          if (sessionAuthResult) {
            console.log('[App] Using fresh session auth result for note creation');
          }
        } else {
          console.log('[App] User declined session authorization, using main wallet');
        }
      }

      // Only pass valid folder addresses to the contract
      // Filter out special folders like 'all', 'notes', 'trash' which are UI-only
      const isValidFolderAddress = (folderId: string) => {
        return folderId && /^0x[0-9a-fA-F]{64}$/.test(folderId);
      };

      const contractFolderId = isValidFolderAddress(selectedFolderId) ? selectedFolderId : null;

      // Create transaction with session capability
      // CRITICAL: Use sessionAuthResult if available (just authorized), otherwise fall back to context state
      const useSession = sessionAuthResult || (isSessionValid && sessionCap && ephemeralKeypair);
      const activeSessionCap = sessionAuthResult?.sessionCap || sessionCap;
      const activeKeypair = sessionAuthResult?.ephemeralKeypair || ephemeralKeypair;

      console.log('[App] Session state check:', {
        hasSessionAuthResult: !!sessionAuthResult,
        isSessionValid,
        hasSessionCap: !!activeSessionCap,
        hasEphemeralKeypair: !!activeKeypair,
        useSession: !!useSession
      });

      if (useSession && activeSessionCap && activeKeypair) {
        console.log('[App] Creating note with session authorization');
        const tx = suiService.createNoteTxWithSession(
          notebook.data.objectId,
          activeSessionCap.objectId,
          encryptedTitle,
          contractFolderId,
          blockchainNoteId // Pass the generated note ID
        );
        await suiService.executeWithSession(tx, activeKeypair);
      } else {
        console.log('[App] Creating note with main wallet signing');
        const tx = suiService.createNoteTx(
          notebook.data.objectId,
          encryptedTitle,
          contractFolderId,
          blockchainNoteId // Pass the generated note ID
        );
        await signAndExecuteTransaction({ transaction: tx });
      }

      console.log('Note created successfully!');
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
      alert('Failed to create folder');
      // Revert optimistic update
      setFolders(prev => prev.filter(f => f.id !== newFolder.id));
    }
  };

  const handleUpdateNote = (id: string, updates: Partial<Note>) => {
    // Optimistic update only - no network calls
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const handleSaveNote = async (id: string) => {
    if (!notebook?.data?.objectId || !encryptionKey) return;

    const note = notes.find(n => n.id === id);
    if (!note) return;

    try {
      // Track fresh session auth result (if we just authorized)
      let sessionAuthResult = null;

      // Check session status and prompt for authorization if needed
      if (!isSessionValid) {
        console.log('[App] No valid session, prompting user for authorization...');

        const userConfirmed = window.confirm(
          'Enable frictionless note saving?\n\n' +
          'This will create a session key for this device, allowing you to save notes without signing every transaction.\n\n' +
          'You will need to sign twice now, but future saves will be automatic.'
        );

        if (userConfirmed) {
          try {
            console.log('[App] User confirmed, authorizing session...');
            sessionAuthResult = await authorizeSession(notebook.data.objectId);
            console.log('[App] Session authorized successfully:', sessionAuthResult);
          } catch (authError: any) {
            console.error('[App] Session authorization failed:', authError);

            // Special handling for WAL token errors
            if (authError?.message?.includes('WAL')) {
              alert(
                'Session authorization requires WAL tokens.\n\n' +
                'You can get WAL tokens from the testnet faucet, but for now we\'ll continue saving with regular wallet signing.\n\n' +
                'Note: Each save will require a signature.'
              );
            } else if (authError?.message?.includes('User rejected')) {
              console.log('[App] User rejected session authorization signature');
              // Silent - user chose not to sign
            } else {
              alert(
                'Session authorization failed.\n\n' +
                'Continuing with regular wallet signing instead.\n\n' +
                'Error: ' + (authError?.message || 'Unknown error')
              );
            }

            // Continue with main wallet mode (fallback)
            console.log('[App] Falling back to main wallet signing mode');
          }
        } else {
          console.log('[App] User declined session authorization, using main wallet');
        }
      }

      // 1. Upload to Walrus (always upload current content)
      // Pass ephemeralKeypair if available to sign the upload transaction
      // Use fresh keypair if available (from just-authorized session), otherwise fall back to context state
      const uploadKeypair = sessionAuthResult?.ephemeralKeypair || (isSessionValid ? ephemeralKeypair : undefined);
      const signer = uploadKeypair;

      console.log('[App] Preparing upload with signer:', {
        isSessionValid,
        hasEphemeralKeypair: !!ephemeralKeypair,
        hasFreshAuth: !!sessionAuthResult,
        signerDefined: !!signer
      });

      const result = await walrusService.uploadInkBlobContent(note.content, encryptionKey, signer, 1);
      const blobId = result.blobId;

      // 2. Encrypt title
      const encryptedTitle = await encryptText(note.title, encryptionKey);

      // 3. Update on Sui
      // Only pass valid folder addresses to the contract
      const isValidFolderAddress = (folderId: string) => {
        return folderId && /^0x[0-9a-fA-F]{64}$/.test(folderId);
      };
      const contractFolderId = isValidFolderAddress(note.folderId) ? note.folderId : null;

      if (sessionAuthResult) {
        console.log('[App] Updating note with session authorization', {
          "notebook": notebook,
          "sessionAuthResult": sessionAuthResult,
          "note": note,
          "id": id,
          "blobId": blobId,
          "encryptedTitle": encryptedTitle,
          "contractFolderId": contractFolderId
        });
        const tx = suiService.updateNoteTxWithSession(
          notebook.data.objectId,
          sessionAuthResult.sessionCap.objectId,
          id,
          blobId,
          encryptedTitle,
          contractFolderId
        );

        await suiService.executeWithSession(tx, sessionAuthResult.ephemeralKeypair);
      } else {
        console.log('[App] Updating note with main wallet signing');
        const tx = suiService.updateNoteTx(
          notebook.data.objectId,
          id,
          blobId,
          encryptedTitle,
          contractFolderId
        );
        await signAndExecuteTransaction({ transaction: tx });
      }

      console.log('Note saved successfully!');

    } catch (error) {
      console.error('Failed to save note:', error);
      alert('Failed to save note');
    }
  };

  const handleDeleteNote = (id: string) => {
    setDeleteNoteId(id);
  };

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
    console.log('[App] Render: Landing page (no account)');
    return <LandingPage />;
  }

  // 2. Connected, but Locked (No Encryption Key)
  if (!encryptionKey) {
    console.log('[App] Render: Unlock screen (no encryption key)');
    return <Onboarding mode="unlock" />;
  }

  // 3. Unlocked, waiting for notebook query to finish
  if (isNotebookLoading) {
    console.log('[App] Render: Loading notebook...');
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-muted-foreground">Loading your notebook...</p>
      </div>
    );
  }

  // 4. Auto-initializing notebook (first time user)
  if (isInitializingNotebook) {
    console.log('[App] Render: Initializing notebook...');
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-lg font-medium mb-2">Initializing Your Notebook</p>
        <p className="text-muted-foreground text-center max-w-md">
          Creating your secure notebook on Sui blockchain...
          <br />
          This will only take a moment.
        </p>
      </div>
    );
  }

  // 5. Initialization failed, show retry option
  if (!notebook && initializationError) {
    console.log('[App] Render: Initialization error screen');
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">Initialization Failed</h1>
          <p className="text-muted-foreground">
            Failed to create your notebook on the blockchain.
            <br />
            <span className="text-sm">Error: {initializationError}</span>
          </p>
          <button
            onClick={() => {
              setInitializationError(null);
              refetchNotebook();
            }}
            className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  console.log('[App] Render: Main app', { hasNotebook: !!notebook });

  // 4. Main App (Unlocked & Initialized)
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
        onCreateFolder={openCreateFolderModal}
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
            selecteInkBlobId={selecteInkBlobId}
            onSelectNote={setSelecteInkBlobId}
            onCreateNote={handleCreateNote}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          <main className="flex-1 bg-background overflow-y-auto relative">
            {selecteInkBlobId ? (
              <Editor
                note={notes.find(n => n.id === selecteInkBlobId)!}
                onUpdateNote={handleUpdateNote}
                onSave={handleSaveNote}
                onDeleteNote={handleDeleteNote}
                onCreateNote={handleCreateNote}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select a note or create a new one
              </div>
            )}
          </main>
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